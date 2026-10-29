#!/usr/bin/env python3
"""Exercise the launcher with a real flock across host exit; no VM is started."""
import fcntl
import os
from pathlib import Path
import subprocess
import sys
import tempfile
import time

fixture = Path(__file__).resolve().parent / 'inherited-lock-fixture.ts'
if len(sys.argv) == 3 and sys.argv[1] == '--holder':
    fd = os.open(sys.argv[2], os.O_RDWR)
    fcntl.flock(fd, fcntl.LOCK_EX)
    os.dup2(fd, 3, inheritable=True)
    os.set_inheritable(3, True)
    os.chdir(fixture.parent.parent)
    os.execvp('node', ['node', '--import', os.environ.get('TSX_LOADER', 'tsx'), str(fixture)])
with tempfile.TemporaryDirectory() as directory:
    lock = Path(directory) / 'lock'
    lock.touch()
    holder = subprocess.run([sys.executable, __file__, '--holder', str(lock)], capture_output=True, text=True, timeout=10)
    if holder.returncode or 'spawned' not in holder.stdout:
        raise RuntimeError(holder.stderr or holder.stdout)
    with lock.open('r+') as contender:
        try:
            fcntl.flock(contender, fcntl.LOCK_EX | fcntl.LOCK_NB)
        except BlockingIOError:
            pass
        else:
            raise AssertionError('lock released while launched child was alive')
        deadline = time.monotonic() + 10
        while True:
            try:
                fcntl.flock(contender, fcntl.LOCK_EX | fcntl.LOCK_NB)
                break
            except BlockingIOError:
                if time.monotonic() >= deadline:
                    raise AssertionError('lock remained after child exit')
                time.sleep(.05)
print('inherited lock survived host exit and released after child exit')
