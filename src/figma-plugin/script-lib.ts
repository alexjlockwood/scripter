import * as M from "../common/messages"
import { fmtPrintArgs } from "../common/fmtval"
import * as base64 from "../common/base64"
import * as utf8 from "./utf8"
import { rpc } from "./rpc"
import { FetchResponse, FetchHeaders, FetchRequest } from "./fetch"
import { gifInfoBuf } from "../common/gif"
import { jpegInfoBuf } from "../common/jpeg"
import { pngInfoBuf } from "../common/png"
import * as filetype from "../common/filetype"
import * as Path from "../common/path"
import markerProps from "../common/marker-props"
import { LazyNumberSequence } from "../common/lazyseq"

// type byte = number

export function base64Encode(data :Uint8Array|ArrayBuffer|string) :string {
  return base64.fromByteArray(
    typeof data == "string" ? utf8.encode(data) :
    data instanceof ArrayBuffer ? new Uint8Array(data) :
    data
  )
}

export function base64Decode(encoded :string) :Uint8Array {
  return base64.toByteArray(encoded)
}


export function confirm(question :string) :Promise<bool> {
  return rpc<M.UIConfirmRequestMsg,M.UIConfirmResponseMsg>(
    "ui-confirm", "ui-confirm-response", { question }
  ).then(r => r.answer)
}


export function fetch(input :any, init? :object) :Promise<FetchResponse> {
  return rpc<M.FetchRequestMsg,M.FetchResponseMsg>(
    "fetch-request", "fetch-response", { input, init }
  ).then(r => new FetchResponse(r))
}

export {
  markerProps,
  fmtPrintArgs,
  Path,
  FetchHeaders as Headers,
  FetchResponse as Response,
  FetchRequest as Request,
  LazyNumberSequence,
}

export function fileType(nameOrData :ArrayLike<byte>|ArrayBuffer|string) :filetype.Info|null {
  if (typeof nameOrData == "string") {
    let ext = Path.ext(nameOrData)
    if (!ext) {
      return null
    }
    return filetype.lookupExt(ext)
  }
  return filetype.lookupHeader(nameOrData)
}


interface IImg { // synced with scripter-env.d.ts
  __scripter_image_marker__ :1

  url         :string
  type        :string  // mime type
  width       :number  // 0 means "unknown"
  height      :number  // 0 means "unknown"
  pixelWidth  :number  // 0 means "unknown"
  pixelHeight :number  // 0 means "unknown"
  source      :string|Uint8Array
  data        :Uint8Array|null  // same as source when loaded
  meta        :{[k:string]:any}  // type-specific metadata

  _guessFromData() :void
}
interface ImgOptions { // synced with scripter-env.d.ts
  type?   :string  // mime type
  width?  :number
  height? :number
}

export function Img(
  this: IImg,
  source :string|ArrayBufferLike|Uint8Array|ArrayLike<number>,
  optionsOrWidth? :ImgOptions|number,
) :void {
  if (!(this instanceof Img)) {
    return new Img(source, optionsOrWidth)
  }
  this.__scripter_image_marker__ = 1
  this.type = ""
  this.width = 0
  this.height = 0
  this.pixelWidth = 0
  this.pixelHeight = 0
  this.source = ""
  this.data = null
  this.meta = {}
  if (optionsOrWidth) {
    if (typeof optionsOrWidth == "object") {
      let o = optionsOrWidth
      this.type = o.type || this.type
      this.width = o.width || this.width
      this.height = o.height || this.height
    } else {
      this.width = optionsOrWidth
    }
  }
  if (this.type == "") {
    let info = fileType(source)
    if (info) {
      this.type = info.type
    }
  }
  if (typeof source == "string") {
    this.source = source
  } else {
    // ArrayBuffer|Uint8Array => Uint8Array
    this.source = (
      source instanceof Uint8Array ? source :
      new Uint8Array(source)
    )
    this.data = this.source
    this._guessFromData()
  }
}


Img.prototype._guessFromData = function() {
  let buf = this.data // Uint8Array
  let fi = filetype.lookupHeader(buf)
  if (!fi) {
    return
  }
  this.type = fi.type

  let meta = {width:0,height:0}
  try {
    switch (fi.type) {
    case "image/png":
      meta = pngInfoBuf(buf)
      break
    case "image/gif":
      meta = gifInfoBuf(buf)
      break
    case "image/jpeg":
      meta = jpegInfoBuf(buf)
      break
    }
    this.meta = meta
    this.pixelWidth = meta.width
    this.pixelHeight = meta.height
  } catch (e) {
    if (DEBUG) {
      console.warn("Img._guessFromData:", e.stack || String(e))
    }
  }
}


const kPromise = Symbol("promise")


Img.prototype.load = function() :Promise<IImg> {
  let p = this[kPromise]
  if (p) {
    return p
  }
  if (typeof this.source == "string") {
    p = fetch(this.source).then(r => r.arrayBuffer()).then(b => {
      this.data = new Uint8Array(b)
      this._guessFromData()
      return this
    })
  } else {
    p = Promise.resolve(this)
  }
  this[kPromise] = p
  return p
}


interface TypedArrayLike {
  buffer     :ArrayBufferLike
  byteOffset :number
  byteLength :number
}

// new(arrayOrArrayBuffer: ArrayLike<number> | ArrayBufferLike): Uint8Array;
// new(buffer: ArrayBufferLike, byteOffset: number, length?: number): Uint8Array;

type ByteSource = string
                | TypedArrayLike
                | ArrayBufferLike
                | ArrayLike<byte>
                | Iterable<byte>

export function Bytes(input :ByteSource) :Uint8Array {
  if (typeof input == "string") {
    // "Fe 0x24" => [254, 36]
    return new Uint8Array(input.trim().split(/[\s\r\n]+/).map(s => {
      let c1 = s.charCodeAt(1)
      if (c1 == 88 || c1 == 120) {
        // strip leading 0X or 0x
        s = s.substr(2)
      }
      return parseInt(s, 16)
    }))
  }
  if ((input as any).buffer instanceof ArrayBuffer) {
    let a = input as TypedArrayLike
    if (a instanceof Uint8Array) {
      return a
    }
    return new Uint8Array(a.buffer, a.byteOffset, a.byteLength)
  }
  let inp :ArrayBufferLike|ArrayLike<byte>/*|Iterable<byte>*/ = input as any
  return new Uint8Array(inp)
}

/*
Argument of type
  'ArrayBuffer | Iterable<number> | ArrayLike<number> | SharedArrayBuffer | TypedArrayLike'
is not assignable to parameter of type
'ArrayBuffer | ArrayLike<number> | SharedArrayBuffer'.

Type 'Iterable<number>' is not assignable to type
  'ArrayBuffer | ArrayLike<number> | SharedArrayBuffer'.
Type 'Iterable<number>' is missing the following properties from type 'SharedArrayBuffer':
  byteLength, length, slice, [Symbol.species], [Symbol.toStringTag]
*/

