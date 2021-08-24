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

export enum Ack {
    Success = "Success",
    Timeout = "Timeout",
    Loginfailed = "LoginFailed",
    Logined = "Logined",
}


export let doLogin = async (url: string): Promise<{ status: string, conn: w3cwebsocket }> => {
    const LoginTimeout = 5 // 5 seconds
    return new Promise((resolve, reject) => {
        let conn = new w3cwebsocket(url)
        conn.binaryType = "arraybuffer"

        // 设置一个登陆超时器
        let tr = setTimeout(() => {
            resolve({ status: Ack.Timeout, conn: conn });
        }, LoginTimeout * 1000);

        conn.onopen = () => {
            console.info("websocket open - readyState:", conn.readyState)

            if (conn.readyState === w3cwebsocket.OPEN) {
                clearTimeout(tr)
                resolve({ status: Ack.Success, conn: conn });
            }
        }
        conn.onerror = (error: Error) => {
            clearTimeout(tr)
            // console.debug(error)
            resolve({ status: Ack.Loginfailed, conn: conn });
        }
    })
}

export class IMClient {
    wsurl: string
    state = State.INIT
    private conn: w3cwebsocket | null
    private lastRead: number
    constructor(url: string, user: string) {
        this.wsurl = `${url}?user=${user}`
        this.conn = null
        this.lastRead = Date.now()
    }
    // 1、登陆
    async login(): Promise<{ status: string }> {
        if (this.state == State.CONNECTED) {
            return { status: Ack.Logined }
        }
        this.state = State.CONNECTING

        let { status, conn } = await doLogin(this.wsurl)
        console.info("login - ", status)

        if (status !== Ack.Success) {
            this.state = State.INIT
            return { status }
        }
        // overwrite onmessage
        conn.onmessage = (evt: IMessageEvent) => {
            try {

            } catch (error) {
                console.error(evt.data, error)
            }
        }
        conn.onerror = (error) => {
            console.info("websocket error: ", error)
        }
        conn.onclose = (e: ICloseEvent) => {
            console.debug("event[onclose] fired")
            this.onclose(e.reason)
        }
        this.conn = conn
        this.state = State.CONNECTED

        return { status }
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
