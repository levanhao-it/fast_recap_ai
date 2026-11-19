import { WebWorkerMLCEngineHandler } from '@mlc-ai/web-llm'

const handler = new WebWorkerMLCEngineHandler()
;(self as unknown as { onmessage: (m: MessageEvent) => void }).onmessage = (msg: MessageEvent) => {
  handler.onmessage(msg)
}
