- **det-node**: node 26.12.1 (V8 14.6.202.34-node.40), origin null, timer 0.0005 ms
- **det-chromium**: Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) HeadlessChrome/156.0.8078.4 Safari/537.36 (Chromium 156.0.8078.4), origin http://127.0.0.1:5241, timer 0.1 ms
- **det-wkwebview-scheme**: Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko), origin vrmxg-dspike://app, timer 1 ms
- **det-wkwebview-loopback**: Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko), origin http://127.0.0.1:60458, timer 0.02 ms

### Math fingerprint (2000 inputs per function; inputs that differ from the first file, max ulp)

| function | det-chromium | det-wkwebview-scheme | det-wkwebview-loopback |
|---|---|---|---|
| sin | **68** (≤1 ulp) | **93** (≤1 ulp) | **93** (≤1 ulp) |
| cos | **79** (≤1 ulp) | **101** (≤1 ulp) | **101** (≤1 ulp) |
| tan | **87** (≤1 ulp) | **812** (≤2 ulp) | **812** (≤2 ulp) |
| asin | **128** (≤1 ulp) | **169** (≤1 ulp) | **169** (≤1 ulp) |
| acos | **134** (≤1 ulp) | **346** (≤1 ulp) | **346** (≤1 ulp) |
| atan | **149** (≤1 ulp) | **143** (≤1 ulp) | **143** (≤1 ulp) |
| atan2 | **387** (≤1 ulp) | **386** (≤1 ulp) | **386** (≤1 ulp) |
| exp | **179** (≤1 ulp) | **179** (≤1 ulp) | **179** (≤1 ulp) |
| log | **81** (≤1 ulp) | **79** (≤1 ulp) | **79** (≤1 ulp) |
| pow | same | same | same |
| cbrt | **166** (≤1 ulp) | **229** (≤1 ulp) | **229** (≤1 ulp) |
| hypot | same | **714** (≤2 ulp) | **714** (≤2 ulp) |
| sinh | **163** (≤2 ulp) | **551** (≤1 ulp) | **551** (≤1 ulp) |
| cosh | **154** (≤2 ulp) | **442** (≤1 ulp) | **442** (≤1 ulp) |
| tanh | **239** (≤2 ulp) | **239** (≤2 ulp) | **239** (≤2 ulp) |
| expm1 | **183** (≤1 ulp) | **194** (≤1 ulp) | **194** (≤1 ulp) |
| log1p | **115** (≤1 ulp) | **115** (≤1 ulp) | **115** (≤1 ulp) |
| log2 | **8** (≤1 ulp) | **7** (≤1 ulp) | **7** (≤1 ulp) |
| log10 | **151** (≤1 ulp) | **150** (≤1 ulp) | **150** (≤1 ulp) |
| sqrt | same | same | same |
| dmath.sin | same | same | same |
| dmath.cos | same | same | same |
| dmath.asin | same | same | same |
| dmath.acos | same | same | same |
| dmath.atan | same | same | same |
| dmath.atan2 | same | same | same |

### Per-step state hashes across runtimes (first step where any runtime differs from the first file, per component; "same" = all 600 steps identical everywhere)

| model | mode | scenario | normalized pose | bone world matrices | spring tails | expressions + lookAt | final hash equal |
|---|---|---|---|---|---|---|---|
| spec | native | mixer | **121** | **121** | same | same | yes |
| spec | native | springs | **121** | **121** | **312** | same | no |
| spec | native | full | **4** | **4** | **312** | **4** | no |
| spec | native | timeline | **4** | **4** | **301** | **4** | no |
| spec | dmath | mixer | same | same | same | same | yes |
| spec | dmath | springs | same | same | same | same | yes |
| spec | dmath | full | same | same | same | same | yes |
| spec | dmath | timeline | same | same | same | same | yes |
| spec | nlerp | mixer | same | same | same | same | yes |
| spec | nlerp | springs | same | same | same | same | yes |
| spec | nlerp | full | **4** | **4** | same | **4** | yes |
| spec | nlerp | timeline | **4** | **4** | same | **4** | no |
| vroid10 | native | mixer | **121** | **121** | same | same | yes |
| vroid10 | native | springs | **121** | **121** | **125** | same | no |
| vroid10 | native | full | **5** | **5** | **125** | **1** | no |
| vroid10 | native | timeline | **6** | **6** | **122** | **1** | no |
| vroid10 | dmath | mixer | same | same | same | same | yes |
| vroid10 | dmath | springs | same | same | same | same | yes |
| vroid10 | dmath | full | same | same | same | same | yes |
| vroid10 | dmath | timeline | same | same | same | same | yes |
| vroid10 | nlerp | mixer | same | same | same | same | yes |
| vroid10 | nlerp | springs | same | same | same | same | yes |
| vroid10 | nlerp | full | **5** | **5** | same | **1** | no |
| vroid10 | nlerp | timeline | **6** | **6** | same | **1** | no |
| vroid0x | native | mixer | **121** | **121** | same | same | yes |
| vroid0x | native | springs | **121** | **121** | **128** | same | no |
| vroid0x | native | full | **4** | **4** | **128** | **4** | no |
| vroid0x | native | timeline | **5** | **5** | **128** | **5** | no |
| vroid0x | dmath | mixer | same | same | same | same | yes |
| vroid0x | dmath | springs | same | same | same | same | yes |
| vroid0x | dmath | full | same | same | same | same | yes |
| vroid0x | dmath | timeline | same | same | same | same | yes |
| vroid0x | nlerp | mixer | same | same | same | same | yes |
| vroid0x | nlerp | springs | same | same | same | same | yes |
| vroid0x | nlerp | full | **4** | **4** | same | **4** | yes |
| vroid0x | nlerp | timeline | **5** | **5** | same | **5** | no |
| seed | native | mixer | **121** | **121** | same | same | yes |
| seed | native | springs | **121** | **121** | **128** | same | yes |
| seed | native | full | **121** | **121** | **128** | **2** | yes |
| seed | native | timeline | **122** | **122** | **128** | **3** | yes |
| seed | dmath | mixer | same | same | same | same | yes |
| seed | dmath | springs | same | same | same | same | yes |
| seed | dmath | full | same | same | same | same | yes |
| seed | dmath | timeline | same | same | same | same | yes |
| seed | nlerp | mixer | same | same | same | same | yes |
| seed | nlerp | springs | same | same | same | same | yes |
| seed | nlerp | full | same | same | same | **2** | yes |
| seed | nlerp | timeline | same | same | same | **3** | yes |

### Repeatability within each runtime (full scenario, two fresh runs, every step)

| runtime | model | native | dmath | nlerp |
|---|---|---|---|---|
| det-node | spec | native: true | dmath: true | nlerp: true |
| det-node | vroid10 | native: true | dmath: true | nlerp: true |
| det-node | vroid0x | native: true | dmath: true | nlerp: true |
| det-node | seed | native: true | dmath: true | nlerp: true |
| det-chromium | spec | native: true | dmath: true | nlerp: true |
| det-chromium | vroid10 | native: true | dmath: true | nlerp: true |
| det-chromium | vroid0x | native: true | dmath: true | nlerp: true |
| det-chromium | seed | native: true | dmath: true | nlerp: true |
| det-wkwebview-scheme | seed | dmath: true | native: true | nlerp: true |
| det-wkwebview-scheme | spec | dmath: true | native: true | nlerp: true |
| det-wkwebview-scheme | vroid0x | dmath: true | native: true | nlerp: true |
| det-wkwebview-scheme | vroid10 | dmath: true | native: true | nlerp: true |
| det-wkwebview-loopback | seed | dmath: true | native: true | nlerp: true |
| det-wkwebview-loopback | spec | dmath: true | native: true | nlerp: true |
| det-wkwebview-loopback | vroid0x | dmath: true | native: true | nlerp: true |
| det-wkwebview-loopback | vroid10 | dmath: true | native: true | nlerp: true |

### Size of the native divergence (max |difference| vs the first file)

| vs | model | scenario | step | bone matrices | spring tails | expressions |
|---|---|---|---|---|---|---|
| det-chromium | spec | mixer | 450 | 0 | 0 | 0 |
| det-chromium | spec | mixer | 600 | 0 | 0 | 0 |
| det-chromium | spec | full | 450 | 2.3e-14 (1062 ulp) | 1.3e-15 (96 ulp) | 0 |
| det-chromium | spec | full | 600 | 0 | 0 | 0 |
| det-chromium | vroid10 | mixer | 450 | 0 | 0 | 0 |
| det-chromium | vroid10 | mixer | 600 | 0 | 0 | 0 |
| det-chromium | vroid10 | full | 450 | 1.2e-13 (2287616 ulp) | 1.6e-14 (147456 ulp) | 0 |
| det-chromium | vroid10 | full | 600 | 1.0e-13 (183175 ulp) | 8.0e-15 (16384 ulp) | 8.9e-16 (2 ulp) |
| det-chromium | vroid0x | mixer | 450 | 0 | 0 | 0 |
| det-chromium | vroid0x | mixer | 600 | 0 | 0 | 0 |
| det-chromium | vroid0x | full | 450 | 9.2e-14 (191296 ulp) | 8.0e-15 (11 ulp) | 5.6e-17 (1 ulp) |
| det-chromium | vroid0x | full | 600 | 6.1e-14 (11810 ulp) | 3.6e-15 (11 ulp) | 0 |
| det-chromium | seed | mixer | 450 | 0 | 0 | 0 |
| det-chromium | seed | mixer | 600 | 0 | 0 | 0 |
| det-chromium | seed | full | 450 | 5.2e-14 (1872 ulp) | 3.6e-15 (128 ulp) | 0 |
| det-chromium | seed | full | 600 | 0 | 0 | 0 |
| det-wkwebview-scheme | spec | mixer | 450 | 0 | 0 | 0 |
| det-wkwebview-scheme | spec | mixer | 600 | 0 | 0 | 0 |
| det-wkwebview-scheme | spec | full | 450 | 4.9e-14 (1362 ulp) | 3.1e-15 (224 ulp) | 0 |
| det-wkwebview-scheme | spec | full | 600 | 5.6e-15 (1282 ulp) | 4.4e-16 (2 ulp) | 0 |
| det-wkwebview-scheme | vroid10 | mixer | 450 | 0 | 0 | 0 |
| det-wkwebview-scheme | vroid10 | mixer | 600 | 0 | 0 | 0 |
| det-wkwebview-scheme | vroid10 | full | 450 | 1.1e-13 (847872 ulp) | 1.1e-14 (98304 ulp) | 0 |
| det-wkwebview-scheme | vroid10 | full | 600 | 1.4e-13 (467872 ulp) | 8.0e-15 (16384 ulp) | 8.9e-16 (2 ulp) |
| det-wkwebview-scheme | vroid0x | mixer | 450 | 0 | 0 | 0 |
| det-wkwebview-scheme | vroid0x | mixer | 600 | 0 | 0 | 0 |
| det-wkwebview-scheme | vroid0x | full | 450 | 8.3e-14 (73552 ulp) | 8.9e-15 (11 ulp) | 5.6e-17 (1 ulp) |
| det-wkwebview-scheme | vroid0x | full | 600 | 5.7e-14 (8172 ulp) | 3.6e-15 (4 ulp) | 0 |
| det-wkwebview-scheme | seed | mixer | 450 | 0 | 0 | 0 |
| det-wkwebview-scheme | seed | mixer | 600 | 0 | 0 | 0 |
| det-wkwebview-scheme | seed | full | 450 | 5.2e-14 (1945 ulp) | 3.6e-15 (128 ulp) | 0 |
| det-wkwebview-scheme | seed | full | 600 | 0 | 0 | 0 |
| det-wkwebview-loopback | spec | mixer | 450 | 0 | 0 | 0 |
| det-wkwebview-loopback | spec | mixer | 600 | 0 | 0 | 0 |
| det-wkwebview-loopback | spec | full | 450 | 4.9e-14 (1362 ulp) | 3.1e-15 (224 ulp) | 0 |
| det-wkwebview-loopback | spec | full | 600 | 5.6e-15 (1282 ulp) | 4.4e-16 (2 ulp) | 0 |
| det-wkwebview-loopback | vroid10 | mixer | 450 | 0 | 0 | 0 |
| det-wkwebview-loopback | vroid10 | mixer | 600 | 0 | 0 | 0 |
| det-wkwebview-loopback | vroid10 | full | 450 | 1.1e-13 (847872 ulp) | 1.1e-14 (98304 ulp) | 0 |
| det-wkwebview-loopback | vroid10 | full | 600 | 1.4e-13 (467872 ulp) | 8.0e-15 (16384 ulp) | 8.9e-16 (2 ulp) |
| det-wkwebview-loopback | vroid0x | mixer | 450 | 0 | 0 | 0 |
| det-wkwebview-loopback | vroid0x | mixer | 600 | 0 | 0 | 0 |
| det-wkwebview-loopback | vroid0x | full | 450 | 8.3e-14 (73552 ulp) | 8.9e-15 (11 ulp) | 5.6e-17 (1 ulp) |
| det-wkwebview-loopback | vroid0x | full | 600 | 5.7e-14 (8172 ulp) | 3.6e-15 (4 ulp) | 0 |
| det-wkwebview-loopback | seed | mixer | 450 | 0 | 0 | 0 |
| det-wkwebview-loopback | seed | mixer | 600 | 0 | 0 | 0 |
| det-wkwebview-loopback | seed | full | 450 | 5.2e-14 (1945 ulp) | 3.6e-15 (128 ulp) | 0 |
| det-wkwebview-loopback | seed | full | 600 | 0 | 0 | 0 |

### Models

| model | VRM | bones | spring joints | colliders | constraints | lookAt | expressions |
|---|---|---|---|---|---|---|---|
| spec | 1 | 59 | 4 | 0 | 0 | bone | 14 |
| vroid10 | 1 | 161 | 106 | 28 | 0 | bone | 14 |
| vroid0x | 0 | 106 | 43 | 22 | 0 | bone | 14 |
| seed | 1 | 128 | 19 | 8 | 23 | expression | 18 |

slerpFlat calls in the mixer scenario (det-node): {"calls":55900,"identical":3,"nlerpBranch":47527,"acosBranch":8370,"acosByStep":{"90":16,"120":1106,"150":168,"180":167,"210":167,"240":166,"270":156,"300":974,"330":1016,"360":884,"390":1017,"420":1602,"450":55,"480":47,"510":829}}

### Render cadence (does calling scene.updateMatrixWorld between steps change the simulation?)

| runtime | model | 60 Hz render = no render | 24 fps render = no render |
|---|---|---|---|
| det-node | spec | true | true |
| det-node | vroid10 | true | true |
| det-chromium | spec | true | true |
| det-chromium | vroid10 | true | true |
| det-wkwebview-scheme | spec | true | true |
| det-wkwebview-scheme | vroid10 | true | true |
| det-wkwebview-loopback | spec | true | true |
| det-wkwebview-loopback | vroid10 | true | true |

### Snapshot / restore (every step after the restore point compared with the straight run)

| runtime | model/driver | from step | same instance | fresh, full | fresh, TRS only | fresh, root+springs+mixer | fresh, no springs | size full / TRS | take ms | restore ms |
|---|---|---|---|---|---|---|---|---|---|---|
| det-node | spec/crossfade | 130 | true | true | true | false (step 131) | false (step 131) | 62 / 26 KB | 0.208 | 0.213 |
| det-node | spec/crossfade | 300 | true | true | true | false (step 301) | false (step 301) | 62 / 26 KB | 0.208 | 0.213 |
| det-node | spec/crossfade | 430 | true | true | true | false (step 431) | false (step 431) | 62 / 26 KB | 0.208 | 0.213 |
| det-node | spec/timeline | 130 | true | true | true | false (step 131) | false (step 131) | 62 / 26 KB | 0.3 | 0.184 |
| det-node | spec/timeline | 300 | true | true | true | false (step 301) | false (step 301) | 62 / 26 KB | 0.3 | 0.184 |
| det-node | spec/timeline | 430 | true | true | true | false (step 431) | false (step 431) | 62 / 26 KB | 0.3 | 0.184 |
| det-node | vroid10/crossfade | 130 | true | true | true | false (step 131) | false (step 131) | 125 / 44 KB | 0.254 | 0.271 |
| det-node | vroid10/crossfade | 300 | true | true | true | false (step 301) | false (step 301) | 125 / 44 KB | 0.254 | 0.271 |
| det-node | vroid10/crossfade | 430 | true | true | true | false (step 431) | false (step 431) | 125 / 44 KB | 0.254 | 0.271 |
| det-node | vroid10/timeline | 130 | true | true | true | false (step 131) | false (step 131) | 125 / 44 KB | 0.225 | 0.239 |
| det-node | vroid10/timeline | 300 | true | true | true | false (step 301) | false (step 301) | 125 / 44 KB | 0.225 | 0.239 |
| det-node | vroid10/timeline | 430 | true | true | true | false (step 431) | false (step 431) | 125 / 44 KB | 0.225 | 0.239 |
| det-chromium | spec/crossfade | 130 | true | true | true | false (step 131) | false (step 131) | 62 / 26 KB | 0.4 | 0.217 |
| det-chromium | spec/crossfade | 300 | true | true | true | false (step 301) | false (step 301) | 62 / 26 KB | 0.4 | 0.217 |
| det-chromium | spec/crossfade | 430 | true | true | true | false (step 431) | false (step 431) | 62 / 26 KB | 0.4 | 0.217 |
| det-chromium | spec/timeline | 130 | true | true | true | false (step 131) | false (step 131) | 62 / 26 KB | 0.1 | 0.083 |
| det-chromium | spec/timeline | 300 | true | true | true | false (step 301) | false (step 301) | 62 / 26 KB | 0.1 | 0.083 |
| det-chromium | spec/timeline | 430 | true | true | true | false (step 431) | false (step 431) | 62 / 26 KB | 0.1 | 0.083 |
| det-chromium | vroid10/crossfade | 130 | true | true | true | false (step 131) | false (step 131) | 125 / 44 KB | 0.2 | 0.233 |
| det-chromium | vroid10/crossfade | 300 | true | true | true | false (step 301) | false (step 301) | 125 / 44 KB | 0.2 | 0.233 |
| det-chromium | vroid10/crossfade | 430 | true | true | true | false (step 431) | false (step 431) | 125 / 44 KB | 0.2 | 0.233 |
| det-chromium | vroid10/timeline | 130 | true | true | true | false (step 131) | false (step 131) | 125 / 44 KB | 0.167 | 0.2 |
| det-chromium | vroid10/timeline | 300 | true | true | true | false (step 301) | false (step 301) | 125 / 44 KB | 0.167 | 0.2 |
| det-chromium | vroid10/timeline | 430 | true | true | true | false (step 431) | false (step 431) | 125 / 44 KB | 0.167 | 0.2 |
| det-wkwebview-scheme | spec/crossfade | 130 | true | true | true | false (step 131) | false (step 131) | 62 / 26 KB | 0 | 0.333 |
| det-wkwebview-scheme | spec/crossfade | 300 | true | true | true | false (step 301) | false (step 301) | 62 / 26 KB | 0 | 0.333 |
| det-wkwebview-scheme | spec/crossfade | 430 | true | true | true | false (step 431) | false (step 431) | 62 / 26 KB | 0 | 0.333 |
| det-wkwebview-scheme | spec/timeline | 130 | true | true | true | false (step 131) | false (step 131) | 62 / 26 KB | 0 | 0.167 |
| det-wkwebview-scheme | spec/timeline | 300 | true | true | true | false (step 301) | false (step 301) | 62 / 26 KB | 0 | 0.167 |
| det-wkwebview-scheme | spec/timeline | 430 | true | true | true | false (step 431) | false (step 431) | 62 / 26 KB | 0 | 0.167 |
| det-wkwebview-scheme | vroid10/crossfade | 130 | true | true | true | false (step 131) | false (step 131) | 125 / 44 KB | 0 | 0.167 |
| det-wkwebview-scheme | vroid10/crossfade | 300 | true | true | true | false (step 301) | false (step 301) | 125 / 44 KB | 0 | 0.167 |
| det-wkwebview-scheme | vroid10/crossfade | 430 | true | true | true | false (step 431) | false (step 431) | 125 / 44 KB | 0 | 0.167 |
| det-wkwebview-scheme | vroid10/timeline | 130 | true | true | true | false (step 131) | false (step 131) | 125 / 44 KB | 0.333 | 0.167 |
| det-wkwebview-scheme | vroid10/timeline | 300 | true | true | true | false (step 301) | false (step 301) | 125 / 44 KB | 0.333 | 0.167 |
| det-wkwebview-scheme | vroid10/timeline | 430 | true | true | true | false (step 431) | false (step 431) | 125 / 44 KB | 0.333 | 0.167 |
| det-wkwebview-loopback | spec/crossfade | 130 | true | true | true | false (step 131) | false (step 131) | 62 / 26 KB | 0.14 | 0.17 |
| det-wkwebview-loopback | spec/crossfade | 300 | true | true | true | false (step 301) | false (step 301) | 62 / 26 KB | 0.14 | 0.17 |
| det-wkwebview-loopback | spec/crossfade | 430 | true | true | true | false (step 431) | false (step 431) | 62 / 26 KB | 0.14 | 0.17 |
| det-wkwebview-loopback | spec/timeline | 130 | true | true | true | false (step 131) | false (step 131) | 62 / 26 KB | 0.053 | 0.097 |
| det-wkwebview-loopback | spec/timeline | 300 | true | true | true | false (step 301) | false (step 301) | 62 / 26 KB | 0.053 | 0.097 |
| det-wkwebview-loopback | spec/timeline | 430 | true | true | true | false (step 431) | false (step 431) | 62 / 26 KB | 0.053 | 0.097 |
| det-wkwebview-loopback | vroid10/crossfade | 130 | true | true | true | false (step 131) | false (step 131) | 125 / 44 KB | 0.087 | 0.14 |
| det-wkwebview-loopback | vroid10/crossfade | 300 | true | true | true | false (step 301) | false (step 301) | 125 / 44 KB | 0.087 | 0.14 |
| det-wkwebview-loopback | vroid10/crossfade | 430 | true | true | true | false (step 431) | false (step 431) | 125 / 44 KB | 0.087 | 0.14 |
| det-wkwebview-loopback | vroid10/timeline | 130 | true | true | true | false (step 131) | false (step 131) | 125 / 44 KB | 0.073 | 0.123 |
| det-wkwebview-loopback | vroid10/timeline | 300 | true | true | true | false (step 301) | false (step 301) | 125 / 44 KB | 0.073 | 0.123 |
| det-wkwebview-loopback | vroid10/timeline | 430 | true | true | true | false (step 431) | false (step 431) | 125 / 44 KB | 0.073 | 0.123 |

