/**
 * Runs function provided in `cb`, returning how long it took to execute.
 * @param cb Function to run
 */
export function timeSync<T>(cb: () => T): {time: number, val: T}  {
    const start = Date.now();
    const val = cb();
    return { time: Date.now() - start, val };
}
