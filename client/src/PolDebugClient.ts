import { createConnection, Socket } from 'net';
import { EventEmitter } from 'events';
import { CancellationToken } from 'vscode';

interface Response {
	body: Record<string, any>,
	command: string,
	request_seq: number,
	seq: number,
	success: boolean,
	type: 'response'
}

interface Event {
	body: Record<string, any>,
	event: string,
	seq: number,
	type: 'event'
}

interface PolProcessListResponse extends Response {
	command: 'processes'
	body: {
		processes: Array<{
			id: number;
			program: string;
			state: number;
		}>
	}
}

export class PolDebugClient extends EventEmitter {
    on(event: 'response', listener: (response: Response) => void): this;
    on(event: 'event', listener: (event: Event) => void): this;
    on(event: string, listener: (...args: any[]) => void): this {
        return super.on(event, listener);
    }

    private constructor(private client: Socket, private password?: string) {
        super();

        client.on('close', () => {
            this.emit('close');
        });

        client.on('data', this.onData);
    }

	private readBuffer: string = '';

	onData = (data: Buffer) => {
	    this.readBuffer += data.toString('utf-8');

	    while (true) {
	        const matches = this.readBuffer.match(/^Content-Length: (\d+)\r\n\r\n/m);
	        if (!matches) {
	            if (this.readBuffer.length > 4096) {
	                this.emit('error', new Error('Read buffer full?'));
	                return;
	            }
	            break;
	        }

	        const length = parseInt(matches[1], 10);

	        if (isNaN(length)) {
	            this.emit('error', new Error('Invalid length in client.onData handler'));
	            return;
	        }

	        const startIndex = matches.index + matches[0].length;
	        const endIndex = startIndex + length;

	        if (this.readBuffer.length >= endIndex) {
	            const message = this.readBuffer.substring(startIndex, endIndex);
	            this.readBuffer = this.readBuffer.substring(endIndex);
	            const obj: Response | Event = JSON.parse(message);
	            this.emit(obj.type, obj);
	            continue;
	        }
	        break;
	    }
	}

	private seq: number = 1;

	public request(command: 'processes', args?: { 'filter'?: string }, timeout?: number): Promise<PolProcessListResponse>;
	public request(command: string, args?: Record<string, any>, timeout?: number): Promise<Response>;

	public request(command: string, args: Record<string, any> = {}, timeout = 1000) {
	    return new Promise((resolve, reject) => {
	        const seq = this.seq++;

	        const responseHandler = (response: Response) => {
	            if (response.request_seq === seq) {
	                this.off('response', responseHandler);
	                if (response.success) {
	                    resolve(response);
	                } else {
	                    reject(response);
	                }
	            }
	        };

	        this.on('response', responseHandler);

	        setTimeout(() => {
	            reject(new Error(`Request ${seq} timed out.`));
	            this.off('response', responseHandler);
	        }, timeout);

	        this.write({ command, type: 'request', seq, 'arguments': args });
	    });
	}

	public write(obj: Record<string, any>) {
	    const str = JSON.stringify(obj);
	    this.client.write(`Content-Length: ${str.length}\r\n\r\n${str}`);
	}

	public destroy() {
	    return new Promise<void>(resolve => {
	        this.client.on('close', () => {
	            resolve();
	            this.client.removeAllListeners();
	            this.client = null;
	        });
	        this.client.destroy();
	    });
	}

	static createConnection(host: string, port: number, password?: string, token?: CancellationToken): Promise<PolDebugClient> {
	    return new Promise((resolve, reject) => {
	        const client = createConnection({ host, port });

	        token?.onCancellationRequested(() => {
	            client.destroy();
	        });

	        client.on('connect', async () => {
	            try {
	                console.log(`Connected to ${host}:${port}`);
	                const dbgClient = new PolDebugClient(client, password);
	                resolve(dbgClient);
	            }
	            catch (e) {
	                reject(e);
	            }
	        });

	        client.on('error', (err) => {
	            reject(err);
	        });
	    });
	}
}
