// AB-T-0589, native Metal: repro 5 (../5-machine-under-load.html) without WebGPU, WebKit or Dawn. The sample's espresso
// machine (content/sample/props/espresso-machine.glb, 39,782 triangles, drawn double-sided) from the morning film's
// frame-72 camera (../5-machine-frame72.json) at 1920x1080, drawn again and again into the same targets, each frame
// copied to a shared buffer and hashed. Nothing changes between draws, so every hash must equal the first (after the
// first draw, which repro 5 found always differs with MSAA). The shading and the passes match repro 5's WGSL:
//   msaa  4 samples, rgba8Unorm, resolved at the end of the pass (storeAction multisampleResolve), depth32Float discarded
//   one   1 sample, stored
// Build and run (from the repo root):
//   swiftc -O spike-webgpu-render/repros/metal/machine.swift -o spike-webgpu-render/repros/metal/machine
//   spike-webgpu-render/repros/metal/machine [--iters 20000] [--modes msaa,one] [--out results.json] [--png dir]
//     [--glb espresso-machine.glb] [--camera 5-machine-frame72.json]   (default: the repo's files)
// Two copies at once are load enough to show it (about 1 MSAA draw in 900 differs); one copy alone, rarely.
import Foundation
import Metal

setvbuf(stdout, nil, _IONBF, 0)
let args = CommandLine.arguments
func opt(_ k: String, _ d: String) -> String { if let i = args.firstIndex(of: k), i + 1 < args.count { return args[i + 1] }; return d }
let iters = Int(opt("--iters", "20000"))!, modes = opt("--modes", "msaa,one").split(separator: ",").map(String.init)
let outPath = opt("--out", ""), pngDir = opt("--png", "")
let here = URL(fileURLWithPath: #filePath).deletingLastPathComponent()
let root = here.appendingPathComponent("../../..").standardized
let W = 1920, H = 1080

// ---------------------------------------------------------------- the mesh (glb) and the camera
let glbPath = opt("--glb", root.appendingPathComponent("content/sample/props/espresso-machine.glb").path)
let camPath = opt("--camera", here.appendingPathComponent("../5-machine-frame72.json").standardized.path)
let glb = try! Data(contentsOf: URL(fileURLWithPath: glbPath))
func u32(_ o: Int) -> Int { glb.withUnsafeBytes { Int($0.loadUnaligned(fromByteOffset: o, as: UInt32.self)) } }
let jsonLen = u32(12)
let json = try! JSONSerialization.jsonObject(with: glb.subdata(in: 20 ..< 20 + jsonLen)) as! [String: Any]
let binStart = 20 + jsonLen + 8
let accessors = json["accessors"] as! [[String: Any]], views = json["bufferViews"] as! [[String: Any]]
func accessor<T>(_ i: Int, _ t: T.Type) -> [T] {
  let a = accessors[i], v = views[a["bufferView"] as! Int]
  let comps = ["SCALAR": 1, "VEC2": 2, "VEC3": 3][a["type"] as! String]!, n = (a["count"] as! Int) * comps
  let off = binStart + (v["byteOffset"] as? Int ?? 0) + (a["byteOffset"] as? Int ?? 0)
  return glb.withUnsafeBytes { raw in (0 ..< n).map { raw.loadUnaligned(fromByteOffset: off + $0 * MemoryLayout<T>.size, as: T.self) } }
}
let prim = ((json["meshes"] as! [[String: Any]])[0]["primitives"] as! [[String: Any]])[0]
let attrs = prim["attributes"] as! [String: Int]
let pos = accessor(attrs["POSITION"]!, Float.self), nrm = accessor(attrs["NORMAL"]!, Float.self), uv = accessor(attrs["TEXCOORD_0"]!, Float.self)
let idxAcc = accessors[prim["indices"] as! Int]
let indices: [UInt32] = (idxAcc["componentType"] as! Int) == 5125 ? accessor(prim["indices"] as! Int, UInt32.self) : accessor(prim["indices"] as! Int, UInt16.self).map { UInt32($0) }
let verts = pos.count / 3
var inter = [Float](repeating: 0, count: verts * 8)
for i in 0 ..< verts { inter.replaceSubrange(8 * i ..< 8 * i + 8, with: [pos[3 * i], pos[3 * i + 1], pos[3 * i + 2], nrm[3 * i], nrm[3 * i + 1], nrm[3 * i + 2], uv[2 * i], uv[2 * i + 1]]) }
let cam = try! JSONSerialization.jsonObject(with: Data(contentsOf: URL(fileURLWithPath: camPath))) as! [String: [Double]]
var uniforms = [Float](repeating: 0, count: 16 * 3 + 4) // model, view, projection (column-major, as three's), eye
for (k, o) in [("model", 0), ("view", 16), ("projection", 32)] { for j in 0 ..< 16 { uniforms[o + j] = Float(cam[k]![j]) } }
for j in 0 ..< 3 { uniforms[48 + j] = Float(cam["cameraPosition"]![j]) }

// ---------------------------------------------------------------- Metal
let device = MTLCreateSystemDefaultDevice()!, queue = device.makeCommandQueue()!
let vbuf = device.makeBuffer(bytes: inter, length: inter.count * 4, options: .storageModeShared)!
let ibuf = device.makeBuffer(bytes: indices, length: indices.count * 4, options: .storageModeShared)!
let ubuf = device.makeBuffer(bytes: uniforms, length: uniforms.count * 4, options: .storageModeShared)!
// the same mipmapped pattern as repro 5, made on the CPU
let TS = 256, levels = 9
let texDesc = MTLTextureDescriptor.texture2DDescriptor(pixelFormat: .rgba8Unorm, width: TS, height: TS, mipmapped: true)
texDesc.usage = .shaderRead; texDesc.storageMode = .shared
let tex = device.makeTexture(descriptor: texDesc)!
var lv = [UInt8](repeating: 0, count: TS * TS * 4)
for y in 0 ..< TS { for x in 0 ..< TS { let c: Double = (((x >> 2) ^ (y >> 2)) & 1) != 0 ? 230 : 60; let o = (y * TS + x) * 4
  lv[o] = UInt8(c); lv[o + 1] = UInt8(c * 0.9); lv[o + 2] = UInt8(c * 0.8); lv[o + 3] = 255 } }
var s = TS
for l in 0 ..< levels {
  tex.replace(region: MTLRegionMake2D(0, 0, s, s), mipmapLevel: l, withBytes: lv, bytesPerRow: s * 4)
  if s > 1 {
    let n = s >> 1; var next = [UInt8](repeating: 0, count: n * n * 4)
    for y in 0 ..< n { for x in 0 ..< n { for c in 0 ..< 4 {
      let a = Int(lv[((2 * y) * s + 2 * x) * 4 + c]) + Int(lv[((2 * y) * s + 2 * x + 1) * 4 + c]) + Int(lv[((2 * y + 1) * s + 2 * x) * 4 + c]) + Int(lv[((2 * y + 1) * s + 2 * x + 1) * 4 + c])
      next[(y * n + x) * 4 + c] = UInt8((a + 2) >> 2) } } }
    lv = next
  }
  s >>= 1
}
let sampDesc = MTLSamplerDescriptor()
sampDesc.minFilter = .linear; sampDesc.magFilter = .linear; sampDesc.mipFilter = .linear; sampDesc.sAddressMode = .repeat; sampDesc.tAddressMode = .repeat
let sampler = device.makeSamplerState(descriptor: sampDesc)!

let msl = """
#include <metal_stdlib>
using namespace metal;
struct U { float4x4 model; float4x4 view; float4x4 projection; float4 eye; };
struct V { packed_float3 p; packed_float3 n; packed_float2 uv; };
struct O { float4 p [[position]]; float3 n; float2 uv; float3 w; };
vertex O vs(uint vid [[vertex_id]], const device V* v [[buffer(0)]], constant U& u [[buffer(1)]]) {
  O o; float4 w = u.model * float4(float3(v[vid].p), 1); o.p = u.projection * u.view * w;
  o.n = (u.model * float4(float3(v[vid].n), 0)).xyz; o.uv = float2(v[vid].uv); o.w = w.xyz; return o; }
fragment float4 fs(O i [[stage_in]], bool ff [[front_facing]], constant U& u [[buffer(0)]], texture2d<float> t [[texture(0)]], sampler s [[sampler(0)]]) {
  float3 base = t.sample(s, i.uv * 8.0).rgb;
  float3 n = normalize(i.n); if (!ff) { n = -n; }
  float3 dxy = max(abs(dfdx(n)), abs(dfdy(n)));
  float rough = clamp(0.3 + max(max(dxy.x, dxy.y), dxy.z), 0.0, 1.0);
  float3 l = normalize(float3(0.4, 1.0, 0.6)); float3 v = normalize(u.eye.xyz - i.w); float3 h = normalize(l + v);
  float spec = pow(max(dot(n, h), 0.0), mix(64.0, 4.0, rough));
  float3 c = base * (0.25 + 0.75 * max(dot(n, l), 0.0)) + float3(spec * 0.6);
  return float4(c / (1.0 + c), 1.0);
}
"""
let lib = try! device.makeLibrary(source: msl, options: nil)
func pipeline(_ samples: Int) -> MTLRenderPipelineState {
  let d = MTLRenderPipelineDescriptor()
  d.vertexFunction = lib.makeFunction(name: "vs"); d.fragmentFunction = lib.makeFunction(name: "fs")
  d.colorAttachments[0].pixelFormat = .rgba8Unorm; d.depthAttachmentPixelFormat = .depth32Float; d.rasterSampleCount = samples
  return try! device.makeRenderPipelineState(descriptor: d)
}
let pipes = ["msaa": pipeline(4), "one": pipeline(1)]
let dsDesc = MTLDepthStencilDescriptor(); dsDesc.depthCompareFunction = .less; dsDesc.isDepthWriteEnabled = true
let depthState = device.makeDepthStencilState(descriptor: dsDesc)!
func target(_ format: MTLPixelFormat, _ samples: Int) -> MTLTexture {
  let d = MTLTextureDescriptor.texture2DDescriptor(pixelFormat: format, width: W, height: H, mipmapped: false)
  d.textureType = samples > 1 ? .type2DMultisample : .type2D; d.sampleCount = samples; d.usage = .renderTarget; d.storageMode = .private
  return device.makeTexture(descriptor: d)!
}
let msColor = target(.rgba8Unorm, 4), msDepth = target(.depth32Float, 4), depth1 = target(.depth32Float, 1), out = target(.rgba8Unorm, 1)
let readback = device.makeBuffer(length: W * H * 4, options: .storageModeShared)!

func frame(_ mode: String) -> [UInt8] {
  let pass = MTLRenderPassDescriptor()
  let c = pass.colorAttachments[0]!
  c.loadAction = .clear; c.clearColor = MTLClearColor(red: 0.5, green: 0.5, blue: 0.5, alpha: 1)
  if mode == "msaa" { c.texture = msColor; c.resolveTexture = out; c.storeAction = .multisampleResolve; pass.depthAttachment.texture = msDepth }
  else { c.texture = out; c.storeAction = .store; pass.depthAttachment.texture = depth1 }
  pass.depthAttachment.loadAction = .clear; pass.depthAttachment.clearDepth = 1; pass.depthAttachment.storeAction = .dontCare
  let cb = queue.makeCommandBuffer()!, enc = cb.makeRenderCommandEncoder(descriptor: pass)!
  enc.setRenderPipelineState(pipes[mode]!); enc.setDepthStencilState(depthState)
  enc.setFrontFacing(.counterClockwise); enc.setCullMode(.none) // WebGPU's defaults for a double-sided material
  enc.setVertexBuffer(vbuf, offset: 0, index: 0); enc.setVertexBuffer(ubuf, offset: 0, index: 1)
  enc.setFragmentBuffer(ubuf, offset: 0, index: 0); enc.setFragmentTexture(tex, index: 0); enc.setFragmentSamplerState(sampler, index: 0)
  enc.drawIndexedPrimitives(type: .triangle, indexCount: indices.count, indexType: .uint32, indexBuffer: ibuf, indexBufferOffset: 0)
  enc.endEncoding()
  let blit = cb.makeBlitCommandEncoder()!
  blit.copy(from: out, sourceSlice: 0, sourceLevel: 0, sourceOrigin: MTLOriginMake(0, 0, 0), sourceSize: MTLSizeMake(W, H, 1), to: readback, destinationOffset: 0, destinationBytesPerRow: W * 4, destinationBytesPerImage: W * H * 4)
  blit.endEncoding()
  cb.commit(); cb.waitUntilCompleted()
  return [UInt8](UnsafeRawBufferPointer(start: readback.contents(), count: W * H * 4))
}
func fnv(_ px: [UInt8]) -> String {
  var h: UInt32 = 0x811c9dc5
  px.withUnsafeBytes { raw in let u = raw.bindMemory(to: UInt32.self); for x in u { h = (h ^ x) &* 0x01000193 } }
  return String(format: "%08x", h)
}
/** Write a frame as a binary PPM (dir given): the odd draw and the reference, to diff. */
func ppm(_ px: [UInt8], _ name: String) {
  guard !pngDir.isEmpty else { return }
  var d = Data("P6\n\(W) \(H)\n255\n".utf8); d.reserveCapacity(W * H * 3 + 20)
  for i in stride(from: 0, to: px.count, by: 4) { d.append(contentsOf: px[i ..< i + 3]) }
  try? FileManager.default.createDirectory(atPath: pngDir, withIntermediateDirectories: true)
  try? d.write(to: URL(fileURLWithPath: pngDir).appendingPathComponent(name + ".ppm"))
}

// ---------------------------------------------------------------- the loop
var result: [String: Any] = ["iters": iters, "size": [W, H], "triangles": indices.count / 3, "device": device.name, "os": ProcessInfo.processInfo.operatingSystemVersionString]
var firstDraw: [String: String] = [:], firstDiffers: [String: Bool] = [:]
for m in modes { let a = frame(m); firstDraw[m] = fnv(a); firstDiffers[m] = fnv(frame(m)) != firstDraw[m]; if firstDiffers[m]! { ppm(a, "\(m)-first-draw") } }
result["firstDrawDiffers"] = firstDiffers
var ref: [String: (px: [UInt8], h: String)] = [:], stats: [String: [String: Any]] = [:]
for m in modes { stats[m] = ["differ": 0, "likeFirstDraw": 0, "odd": [String: Int]()] }
let t0 = Date()
for i in 0 ..< iters {
  for m in modes {
    let px = frame(m), h = fnv(px)
    guard let r = ref[m] else {
      ref[m] = (px, h); var cov = 0; for k in stride(from: 0, to: px.count, by: 4) where px[k] != 128 || px[k + 1] != 128 { cov += 1 }
      stats[m]!["covered"] = cov; ppm(px, "\(m)-reference"); continue
    }
    if h != r.h {
      stats[m]!["differ"] = (stats[m]!["differ"] as! Int) + 1
      var odd = stats[m]!["odd"] as! [String: Int]; odd[h, default: 0] += 1; stats[m]!["odd"] = odd
      if h == firstDraw[m] { stats[m]!["likeFirstDraw"] = (stats[m]!["likeFirstDraw"] as! Int) + 1 }
      if stats[m]!["firstDiff"] == nil {
        var n = 0, at: [[String: Int]] = []
        for k in 0 ..< px.count where px[k] != r.px[k] { n += 1; if at.count < 8 { at.append(["x": (k / 4) % W, "y": (k / 4) / W, "ch": k % 4, "here": Int(px[k]), "first": Int(r.px[k])]) } }
        stats[m]!["firstDiff"] = ["iter": i, "values": n, "at": at]; ppm(px, "\(m)-odd-\(i)")
      }
    }
  }
  if i % 2000 == 0 { print("\(i): " + modes.map { "\($0) \(stats[$0]!["differ"]!)" }.joined(separator: "  ")) }
}
result["ms"] = Int(Date().timeIntervalSince(t0) * 1000)
result["modes"] = stats
result["pass"] = modes.allSatisfy { (stats[$0]!["differ"] as! Int) == 0 }
let data = try! JSONSerialization.data(withJSONObject: result, options: [.prettyPrinted, .sortedKeys])
if !outPath.isEmpty { try! data.write(to: URL(fileURLWithPath: outPath)) }
print(String(data: data, encoding: .utf8)!)
