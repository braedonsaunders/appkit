#!/usr/bin/env python3
"""Copy a Debian disk image's kernel and initrd out of its ext4 root, read-only.

    extract-boot.py <disk.raw> <out-dir>

Writes <out-dir>/Image (an uncompressed arm64 Image, which is what
VZLinuxBootLoader boots), <out-dir>/initrd, and <out-dir>/release (the kernel
version). The kernel and initrd come from the image itself because that is the
only place Debian publishes the initrd that matches the image's modules.

macOS cannot mount ext4, so this reads the filesystem directly: GPT, the
superblock, group descriptors, inodes, extent trees and directories. It only
reads, and it supports exactly what a stock Debian cloud image uses.
"""
import gzip
import os
import shutil
import struct
import subprocess
import sys
import zlib

SECTOR = 512
EXT4_MAGIC = 0xEF53
EXTENTS_FLAG = 0x80000
INLINE_DATA_FLAG = 0x10000000
INCOMPAT_64BIT = 0x80
S_IFMT = 0o170000
S_IFDIR = 0o040000
S_IFLNK = 0o120000


def partitions(image):
    image.seek(SECTOR)
    header = image.read(92)
    if header[:8] != b"EFI PART":
        return [0]
    entries_lba, count, size = struct.unpack_from("<QII", header, 72)
    offsets = []
    for index in range(count):
        image.seek(entries_lba * SECTOR + index * size)
        entry = image.read(size)
        if entry[:16] == b"\0" * 16:
            continue
        first = struct.unpack_from("<Q", entry, 32)[0]
        offsets.append(first * SECTOR)
    return offsets


class Ext4:
    def __init__(self, image, offset):
        self.image = image
        self.offset = offset
        superblock = self.read(1024, 1024)
        if struct.unpack_from("<H", superblock, 0x38)[0] != EXT4_MAGIC:
            raise ValueError("not ext4")
        self.block_size = 1024 << struct.unpack_from("<I", superblock, 0x18)[0]
        self.first_data_block = struct.unpack_from("<I", superblock, 0x14)[0]
        self.inodes_per_group = struct.unpack_from("<I", superblock, 0x28)[0]
        self.inode_size = struct.unpack_from("<H", superblock, 0x58)[0]
        incompat = struct.unpack_from("<I", superblock, 0x60)[0]
        self.is64 = bool(incompat & INCOMPAT_64BIT)
        self.desc_size = struct.unpack_from("<H", superblock, 0xFE)[0] if self.is64 else 32
        self.gdt = (self.first_data_block + 1) * self.block_size

    def read(self, position, length):
        self.image.seek(self.offset + position)
        data = self.image.read(length)
        if len(data) != length:
            raise ValueError("read past the end of the image")
        return data

    def inode(self, number):
        group, index = divmod(number - 1, self.inodes_per_group)
        desc = self.read(self.gdt + group * self.desc_size, self.desc_size)
        table = struct.unpack_from("<I", desc, 0x8)[0]
        if self.is64 and self.desc_size >= 64:
            table |= struct.unpack_from("<I", desc, 0x28)[0] << 32
        return self.read(table * self.block_size + index * self.inode_size, self.inode_size)

    @staticmethod
    def mode(inode):
        return struct.unpack_from("<H", inode, 0)[0]

    @staticmethod
    def size(inode):
        low, high = struct.unpack_from("<I", inode, 0x4)[0], struct.unpack_from("<I", inode, 0x6C)[0]
        return high << 32 | low

    def extents(self, node):
        magic, entries, _, depth = struct.unpack_from("<HHHH", node, 0)
        if magic != 0xF30A:
            raise ValueError("bad extent header")
        for index in range(entries):
            entry = node[12 + index * 12: 24 + index * 12]
            if depth == 0:
                logical, length, start_high, start_low = struct.unpack("<IHHI", entry)
                uninitialized = length > 32768
                if uninitialized:
                    length -= 32768
                yield logical, length, start_high << 32 | start_low, uninitialized
            else:
                _, leaf_low, leaf_high = struct.unpack_from("<IIH", entry, 0)
                child = self.read((leaf_high << 32 | leaf_low) * self.block_size, self.block_size)
                yield from self.extents(child)

    def contents(self, inode):
        flags = struct.unpack_from("<I", inode, 0x20)[0]
        size = self.size(inode)
        if flags & INLINE_DATA_FLAG:
            raise ValueError("inline data is not supported")
        if not flags & EXTENTS_FLAG:
            raise ValueError("block-mapped files are not supported")
        data = bytearray(size)
        for logical, length, physical, uninitialized in self.extents(inode[0x28:0x28 + 60]):
            begin = logical * self.block_size
            if begin >= size or uninitialized:
                continue
            count = min(length * self.block_size, size - begin)
            data[begin:begin + count] = self.read(physical * self.block_size, count)
        return bytes(data)

    def entries(self, inode):
        data = self.contents(inode)
        position = 0
        while position + 8 <= len(data):
            number, record, name_length = struct.unpack_from("<IHB", data, position)
            if record < 8:
                break
            if number:
                yield data[position + 8: position + 8 + name_length].decode("utf-8", "replace"), number
            position += record

    def lookup(self, path, follow=True, depth=0):
        if depth > 16:
            raise ValueError("too many symbolic links")
        number = 2
        parts = [part for part in path.split("/") if part]
        for index, part in enumerate(parts):
            directory = self.inode(number)
            if self.mode(directory) & S_IFMT != S_IFDIR:
                raise FileNotFoundError(path)
            found = dict(self.entries(directory)).get(part)
            if found is None:
                raise FileNotFoundError(path)
            number = found
            node = self.inode(number)
            last = index == len(parts) - 1
            if self.mode(node) & S_IFMT == S_IFLNK and (follow or not last):
                target = self.symlink(node)
                base = "/" + "/".join(parts[:index])
                rest = "/".join(parts[index + 1:])
                joined = target if target.startswith("/") else os.path.join(base, target)
                return self.lookup(os.path.normpath(joined + ("/" + rest if rest else "")), follow, depth + 1)
        return self.inode(number)

    def symlink(self, inode):
        size = self.size(inode)
        flags = struct.unpack_from("<I", inode, 0x20)[0]
        if size < 60 and not flags & EXTENTS_FLAG:
            return inode[0x28:0x28 + size].decode()
        return self.contents(inode).decode()


def uncompressed_image(kernel):
    """Debian's arm64 vmlinuz is a gzip'd Image or an EFI zboot image."""
    if kernel[:2] == b"\x1f\x8b":
        return gzip.decompress(kernel)
    if kernel[:2] == b"MZ" and kernel[4:8] == b"zimg":
        start, length = struct.unpack_from("<II", kernel, 8)
        kind = kernel[24:32].rstrip(b"\0").decode()
        payload = kernel[start:start + length]
        if kind == "gzip":
            return zlib.decompress(payload, 16 + zlib.MAX_WBITS)
        if kind == "zstd":
            zstd = shutil.which("zstd")
            if not zstd:
                raise SystemExit("this kernel is zstd-compressed EFI zboot; install zstd to unpack it")
            return subprocess.run([zstd, "-dc"], input=payload, check=True, capture_output=True).stdout
        raise SystemExit(f"unsupported EFI zboot compression: {kind}")
    if kernel[0x38:0x3C] == b"ARM\x64":
        return kernel
    raise SystemExit("the kernel is neither an arm64 Image, a gzip'd Image, nor EFI zboot")


def main():
    if len(sys.argv) != 3:
        raise SystemExit(__doc__)
    disk, out = sys.argv[1], sys.argv[2]
    with open(disk, "rb") as image:
        for offset in partitions(image):
            try:
                fs = Ext4(image, offset)
                boot = dict(fs.entries(fs.lookup("/boot")))
            except (ValueError, FileNotFoundError):
                continue
            kernels = sorted(name for name in boot if name.startswith("vmlinuz-"))
            if not kernels:
                continue
            release = kernels[-1][len("vmlinuz-"):]
            if f"initrd.img-{release}" not in boot:
                raise SystemExit(f"/boot has vmlinuz-{release} but no matching initrd")
            kernel = fs.contents(fs.lookup(f"/boot/vmlinuz-{release}"))
            initrd = fs.contents(fs.lookup(f"/boot/initrd.img-{release}"))
            image_bytes = uncompressed_image(kernel)
            if image_bytes[0x38:0x3C] != b"ARM\x64":
                raise SystemExit("the unpacked kernel is not an arm64 Image")
            os.makedirs(out, exist_ok=True)
            with open(os.path.join(out, "Image"), "wb") as handle:
                handle.write(image_bytes)
            with open(os.path.join(out, "initrd"), "wb") as handle:
                handle.write(initrd)
            with open(os.path.join(out, "release"), "w") as handle:
                handle.write(release + "\n")
            print(release)
            return
    raise SystemExit("no ext4 partition with a kernel in /boot was found")


if __name__ == "__main__":
    main()
