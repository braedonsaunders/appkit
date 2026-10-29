import { defaultLauncher } from '../src/machine'

const child = defaultLauncher(process.execPath, ['-e', 'setTimeout(() => {}, 1500)'], { inheritedFds: [3] })
child.stdout?.resume()
child.stderr?.resume()
child.unref()
child.stdout?.unref()
child.stderr?.unref()
console.log('spawned')
