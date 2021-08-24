import { IMClient, sleep } from "./sdk";
import { w3cwebsocket, IMessageEvent, ICloseEvent } from 'websocket';

const main = async () => {
    let cli = new IMClient("ws://localhost:8000", "ccc");
    let { status } = await cli.login()
    console.log("client login return -- ", status)

    await sleep(15)
    cli.logout()
}

// main()

let send = async (url: string) => {
    let conn = new w3cwebsocket(url)
    conn.binaryType = "arraybuffer"
    conn.onopen = () => {
        console.info("websocket open - readyState:", conn.readyState)
        if (conn.readyState === w3cwebsocket.OPEN) {
            let req = JSON.stringify({ "seq": 1, "msg": "hello world" })
            conn.send(req)
        }
    }
 
    conn.onclose = (e: ICloseEvent) => {
        console.debug("event[onclose] fired")
    }

    conn.onmessage = (evt: IMessageEvent) => {
        let resp = JSON.parse(<string>evt.data)
        console.info(resp)
    }

    await sleep(5)
}

send("ws://localhost:8000?user=aaa")