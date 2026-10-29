#!/usr/bin/env python3
"""Build the pinned Cloud Hypervisor backport without modifying an existing checkout."""
import argparse
import hashlib
import json
import os
from pathlib import Path
import platform
import shutil
import subprocess


def run(*args, cwd=None, env=None):
    subprocess.run(args, cwd=cwd, env=env, check=True)


def output(*args, cwd=None):
    return subprocess.check_output(args, cwd=cwd, text=True).strip()


def digest(path):
    with path.open('rb') as stream:
        return hashlib.file_digest(stream, 'sha256').hexdigest()


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--output', required=True, type=Path,
                        help='New directory for source, build output, and artifacts')
    parser.add_argument('--prepare-only', action='store_true',
                        help='Verify and prepare the pinned source tree without compiling')
    parser.add_argument('--jobs', type=int, default=2)
    args = parser.parse_args()
    if args.jobs < 1:
        parser.error('--jobs must be positive')
    here = Path(__file__).resolve().parent
    manifest = json.loads((here / 'source.json').read_text())
    arch = {'x86_64': 'x86_64', 'aarch64': 'aarch64', 'arm64': 'aarch64'}.get(platform.machine())
    if not args.prepare_only and (platform.system() != 'Linux' or arch is None):
        parser.error('Compiling requires a native Linux amd64 or arm64 host')
    for patch in manifest['patches']:
        path = here / patch['file']
        if digest(path) != patch['sha256']:
            raise RuntimeError(f'Patch checksum mismatch: {patch["file"]}')
    destination = args.output.absolute()
    destination.mkdir(mode=0o700, parents=False, exist_ok=False)
    source = destination / 'source'
    run('git', 'init', '--quiet', str(source))
    run('git', 'remote', 'add', 'origin', manifest['repository'], cwd=source)
    run('git', 'fetch', '--depth=1', 'origin', manifest['baseCommit'], cwd=source)
    run('git', 'checkout', '--quiet', '--detach', 'FETCH_HEAD', cwd=source)
    if output('git', 'rev-parse', 'HEAD', cwd=source) != manifest['baseCommit']:
        raise RuntimeError('Base revision mismatch')
    for patch in manifest['patches']:
        run('git', 'apply', '--index', str(here / patch['file']), cwd=source)
    if output('git', 'write-tree', cwd=source) != manifest['sourceTree']:
        raise RuntimeError('Patched source tree differs from the pinned tree')
    shutil.copy2(here / 'source.json', destination / 'source.json')
    if args.prepare_only:
        print(f'Verified source tree {manifest["sourceTree"]}: {source}')
        return
    target = f'{arch}-unknown-linux-musl'
    toolchain = manifest['rustVersion']
    run('rustup', 'toolchain', 'install', toolchain, '--profile', 'minimal')
    run('rustup', 'target', 'add', '--toolchain', toolchain, target)
    env = dict(os.environ, CH_EXTRA_VERSION=manifest['buildSuffix'],
               CARGO_BUILD_JOBS=str(args.jobs), CARGO_TARGET_DIR=str(destination / 'target'))
    cargo = ('cargo', f'+{toolchain}')
    # These tests exercise real mmap/pagemap and private-page snapshot writes.
    for name in ('pagemap::tests', 'memory_manager::tests'):
        run(*cargo, 'test', '--locked', '-p', 'vmm', '--lib', '--features', 'kvm', '--target', target,
            name, '--', '--test-threads=1', cwd=source, env=env)
    run(*cargo, 'build', '--locked', '--release', '-p', 'cloud-hypervisor',
        '--bins', '--target', target, cwd=source, env=env)
    artifacts = destination / 'artifacts'
    artifacts.mkdir()
    hashes = {}
    for name in ('cloud-hypervisor', 'ch-remote'):
        shutil.copy2(destination / 'target' / target / 'release' / name, artifacts / name)
        hashes[name] = digest(artifacts / name)
    version = output(str(artifacts / 'cloud-hypervisor'), '--version')
    if manifest['buildSuffix'] not in version:
        raise RuntimeError('Built binary lacks the pinned build identifier')
    shutil.copytree(source / 'LICENSES', artifacts / 'LICENSES')
    shutil.copy2(here / 'source.json', artifacts / 'source.json')
    (artifacts / 'build.json').write_text(json.dumps({
        'target': target, 'version': version, 'rustVersion': toolchain,
        'sourceTree': manifest['sourceTree'], 'sha256': hashes,
    }, indent=2) + '\n')
    (artifacts / 'SHA256SUMS').write_text(''.join(f'{value}  {name}\n' for name, value in hashes.items()))
    print(f'Built and checked {version}: {artifacts}')


if __name__ == '__main__':
    main()
