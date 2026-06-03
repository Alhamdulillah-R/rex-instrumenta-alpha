import { toPython } from 'curlconverter'
import { postProcessToPython } from './generate'

// curlconverter 浏览器版在模块顶层 await 加载 tree-sitter wasm(webParser.js), 故 import 'curlconverter'
// 本身是异步完成的 —— 等本模块(及其懒加载的视图)就绪时, parser 已初始化, toPython 可同步调用.

/**
 * convertCurlToCffi 把一条 curl 命令转成 curl_cffi 代码.
 * 解析(curl→标准 requests)走 curlconverter 的 tree-sitter-bash wasm, 再后处理成 curl_cffi.
 * @param curl        curl 命令(小黄鸟等导出的多 -H 形式)
 * @param impersonate curl_cffi impersonate 目标(如 chrome136)
 * @return curl_cffi python 源码
 * @throws curl 解析失败时 curlconverter 会抛 CCError, 交由调用方提示
 */
export function convertCurlToCffi(curl: string, impersonate: string): string {
  const py = toPython(curl)
  return postProcessToPython(py, impersonate)
}
