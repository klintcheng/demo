import { w3cwebsocket, IMessageEvent, ICloseEvent } from 'websocket';

export let sleep = async (second: number): Promise<void> => {
    return new Promise((resolve, _) => {
        setTimeout(() => {
            resolve()
        }, second * 1000)
    })
}

export enum State {
    INIT,
    CONNECTING,
    CONNECTED,
    RECONNECTING,
    CLOSEING,
    CLOSED,
}

export class Seq {
    static num: number = 0
    static Next() {
        Seq.num++
        Seq.num = Seq.num % 65536
        return Seq.num
    }
}

export class Message {
    sequence: number = 0;
    type: number = 1;
    message?: string;
    from?: string; // sender
    constructor(message?: string) {
        this.message = message;
        this.sequence = Seq.Next()
    }
}

export class Request {
    sendTime: number
    callback: (response: Message) => void
    constructor(callback: (response: Message) => void) {
        this.sendTime = Date.now()
        this.callback = callback
    }
}

export class Response {
    success: boolean = false
    message?: Message
    constructor(success: boolean, message?: Message) {
        this.success = success;
        this.message = message;
    }
}

export class WebsocketClient {
    wsurl: string
    state = State.INIT
    private conn: w3cwebsocket | null
    private sendq = new Map<number, Request>()
    constructor(url: string, user: string) {
        this.wsurl = `${url}?user=${user}`
        this.conn = null
    }
    // 1、登陆
    async login(): Promise<{ success: boolean }> {
        if (this.state == State.CONNECTED) {
            return { success: false }
        }
        this.state = State.CONNECTING
        return new Promise((resolve, _) => {
            let conn = new w3cwebsocket(this.wsurl)
            conn.binaryType = "arraybuffer"
            let returned = false
            conn.onopen = () => {
                console.info("websocket open - readyState:", conn.readyState)
                if (conn.readyState === w3cwebsocket.OPEN) {
                    returned = true
                    resolve({ success: true })
                }
            }

            // overwrite onmessage
            conn.onmessage = (evt: IMessageEvent) => {
                try {
                    let msg = new Message();
                    Object.assign(msg, JSON.parse(<string>evt.data))
                    if (msg.type == 2) {
                        let req = this.sendq.get(msg.sequence)
                        if (req) {
                            req.callback(msg)
                        }
                    } else if (msg.type == 3) {
                        console.log(msg.message, msg.from)
                    }
                } catch (error) {
                    console.error(evt.data, error)
                }
            }

            conn.onerror = (error) => {
                console.info("websocket error: ", error)
                if (returned) {
                    resolve({ success: false })
                }
            }

            conn.onclose = (e: ICloseEvent) => {
                console.debug("event[onclose] fired")
                this.onclose(e.reason)
            }
            this.conn = conn
            this.state = State.CONNECTED
        })
    }
    logout() {
        if (this.state === State.CLOSEING) {
            return
        }
        this.state = State.CLOSEING
        if (!this.conn) {
            return
        }
        this.conn.close()
    }
    // 表示连接中止
    private onclose(reason: string) {
        console.info("connection closed due to " + reason)
        this.state = State.CLOSED
    }
    async request(data: Message): Promise<Response> {
        return new Promise((resolve, _) => {
            let seq = data.sequence

            // asynchronous wait ack from server
            let callback = (msg: Message) => {
                // remove from sendq
                this.sendq.delete(seq)
                resolve(new Response(true, msg))
            }

            this.sendq.set(seq, new Request(callback))

            if (!this.send(JSON.stringify(data))) {
                resolve(new Response(false))
            }
        })
    }
    send(data: string): boolean {
        try {
            if (this.conn == null) {
                return false
            }
            this.conn.send(data)
        } catch (error) {
            return false
        }
        return true
    }
}
