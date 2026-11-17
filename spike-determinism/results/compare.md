- **node**: node 26.12.1 (V8 14.6.202.34-node.40), origin null, timer 0.0006 ms
- **chromium**: Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) HeadlessChrome/156.0.8078.4 Safari/537.36 (Chromium 156.0.8078.4), origin http://127.0.0.1:5241, timer 0.1 ms
- **wkwebview-scheme**: Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko), origin vrmxg-dspike://app, timer 1 ms
- **wkwebview-loopback**: Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko), origin http://127.0.0.1:60442, timer 0.02 ms

### Math fingerprint (2000 inputs per function; inputs that differ from the first file, max ulp)

| function | chromium | wkwebview-scheme | wkwebview-loopback |
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
| node | spec | native: true | dmath: true | nlerp: true |
| node | vroid10 | native: true | dmath: true | nlerp: true |
| node | vroid0x | native: true | dmath: true | nlerp: true |
| node | seed | native: true | dmath: true | nlerp: true |
| chromium | spec | native: true | dmath: true | nlerp: true |
| chromium | vroid10 | native: true | dmath: true | nlerp: true |
| chromium | vroid0x | native: true | dmath: true | nlerp: true |
| chromium | seed | native: true | dmath: true | nlerp: true |
| wkwebview-scheme | seed | dmath: true | native: true | nlerp: true |
| wkwebview-scheme | spec | dmath: true | native: true | nlerp: true |
| wkwebview-scheme | vroid0x | dmath: true | native: true | nlerp: true |
| wkwebview-scheme | vroid10 | dmath: true | native: true | nlerp: true |
| wkwebview-loopback | seed | dmath: true | native: true | nlerp: true |
| wkwebview-loopback | spec | dmath: true | native: true | nlerp: true |
| wkwebview-loopback | vroid0x | dmath: true | native: true | nlerp: true |
| wkwebview-loopback | vroid10 | dmath: true | native: true | nlerp: true |

### Size of the native divergence (max |difference| vs the first file)

| vs | model | scenario | step | bone matrices | spring tails | expressions |
|---|---|---|---|---|---|---|
| chromium | spec | mixer | 450 | 0 | 0 | 0 |
| chromium | spec | mixer | 600 | 0 | 0 | 0 |
| chromium | spec | full | 450 | 2.3e-14 (1062 ulp) | 1.3e-15 (96 ulp) | 0 |
| chromium | spec | full | 600 | 0 | 0 | 0 |
| chromium | vroid10 | mixer | 450 | 0 | 0 | 0 |
| chromium | vroid10 | mixer | 600 | 0 | 0 | 0 |
| chromium | vroid10 | full | 450 | 1.2e-13 (2287616 ulp) | 1.6e-14 (147456 ulp) | 0 |
| chromium | vroid10 | full | 600 | 1.0e-13 (183175 ulp) | 8.0e-15 (16384 ulp) | 8.9e-16 (2 ulp) |
| chromium | vroid0x | mixer | 450 | 0 | 0 | 0 |
| chromium | vroid0x | mixer | 600 | 0 | 0 | 0 |
| chromium | vroid0x | full | 450 | 9.2e-14 (191296 ulp) | 8.0e-15 (11 ulp) | 5.6e-17 (1 ulp) |
| chromium | vroid0x | full | 600 | 6.1e-14 (11810 ulp) | 3.6e-15 (11 ulp) | 0 |
| chromium | seed | mixer | 450 | 0 | 0 | 0 |
| chromium | seed | mixer | 600 | 0 | 0 | 0 |
| chromium | seed | full | 450 | 5.2e-14 (1872 ulp) | 3.6e-15 (128 ulp) | 0 |
| chromium | seed | full | 600 | 0 | 0 | 0 |
| wkwebview-scheme | spec | mixer | 450 | 0 | 0 | 0 |
| wkwebview-scheme | spec | mixer | 600 | 0 | 0 | 0 |
| wkwebview-scheme | spec | full | 450 | 4.9e-14 (1362 ulp) | 3.1e-15 (224 ulp) | 0 |
| wkwebview-scheme | spec | full | 600 | 5.6e-15 (1282 ulp) | 4.4e-16 (2 ulp) | 0 |
| wkwebview-scheme | vroid10 | mixer | 450 | 0 | 0 | 0 |
| wkwebview-scheme | vroid10 | mixer | 600 | 0 | 0 | 0 |
| wkwebview-scheme | vroid10 | full | 450 | 1.1e-13 (847872 ulp) | 1.1e-14 (98304 ulp) | 0 |
| wkwebview-scheme | vroid10 | full | 600 | 1.4e-13 (467872 ulp) | 8.0e-15 (16384 ulp) | 8.9e-16 (2 ulp) |
| wkwebview-scheme | vroid0x | mixer | 450 | 0 | 0 | 0 |
| wkwebview-scheme | vroid0x | mixer | 600 | 0 | 0 | 0 |
| wkwebview-scheme | vroid0x | full | 450 | 8.3e-14 (73552 ulp) | 8.9e-15 (11 ulp) | 5.6e-17 (1 ulp) |
| wkwebview-scheme | vroid0x | full | 600 | 5.7e-14 (8172 ulp) | 3.6e-15 (4 ulp) | 0 |
| wkwebview-scheme | seed | mixer | 450 | 0 | 0 | 0 |
| wkwebview-scheme | seed | mixer | 600 | 0 | 0 | 0 |
| wkwebview-scheme | seed | full | 450 | 5.2e-14 (1945 ulp) | 3.6e-15 (128 ulp) | 0 |
| wkwebview-scheme | seed | full | 600 | 0 | 0 | 0 |
| wkwebview-loopback | spec | mixer | 450 | 0 | 0 | 0 |
| wkwebview-loopback | spec | mixer | 600 | 0 | 0 | 0 |
| wkwebview-loopback | spec | full | 450 | 4.9e-14 (1362 ulp) | 3.1e-15 (224 ulp) | 0 |
| wkwebview-loopback | spec | full | 600 | 5.6e-15 (1282 ulp) | 4.4e-16 (2 ulp) | 0 |
| wkwebview-loopback | vroid10 | mixer | 450 | 0 | 0 | 0 |
| wkwebview-loopback | vroid10 | mixer | 600 | 0 | 0 | 0 |
| wkwebview-loopback | vroid10 | full | 450 | 1.1e-13 (847872 ulp) | 1.1e-14 (98304 ulp) | 0 |
| wkwebview-loopback | vroid10 | full | 600 | 1.4e-13 (467872 ulp) | 8.0e-15 (16384 ulp) | 8.9e-16 (2 ulp) |
| wkwebview-loopback | vroid0x | mixer | 450 | 0 | 0 | 0 |
| wkwebview-loopback | vroid0x | mixer | 600 | 0 | 0 | 0 |
| wkwebview-loopback | vroid0x | full | 450 | 8.3e-14 (73552 ulp) | 8.9e-15 (11 ulp) | 5.6e-17 (1 ulp) |
| wkwebview-loopback | vroid0x | full | 600 | 5.7e-14 (8172 ulp) | 3.6e-15 (4 ulp) | 0 |
| wkwebview-loopback | seed | mixer | 450 | 0 | 0 | 0 |
| wkwebview-loopback | seed | mixer | 600 | 0 | 0 | 0 |
| wkwebview-loopback | seed | full | 450 | 5.2e-14 (1945 ulp) | 3.6e-15 (128 ulp) | 0 |
| wkwebview-loopback | seed | full | 600 | 0 | 0 | 0 |

### Models

| model | VRM | bones | spring joints | colliders | constraints | lookAt | expressions |
|---|---|---|---|---|---|---|---|
| spec | 1 | 59 | 4 | 0 | 0 | bone | 14 |
| vroid10 | 1 | 161 | 106 | 28 | 0 | bone | 14 |
| vroid0x | 0 | 106 | 43 | 22 | 0 | bone | 14 |
| seed | 1 | 128 | 19 | 8 | 23 | expression | 18 |

slerpFlat calls in the mixer scenario (node): {"calls":55900,"identical":3,"nlerpBranch":47527,"acosBranch":8370,"acosByStep":{"90":16,"120":1106,"150":168,"180":167,"210":167,"240":166,"270":156,"300":974,"330":1016,"360":884,"390":1017,"420":1602,"450":55,"480":47,"510":829}}

### Render cadence (does calling scene.updateMatrixWorld between steps change the simulation?)

| runtime | model | 60 Hz render = no render | 24 fps render = no render |
|---|---|---|---|
| node | spec | true | true |
| node | vroid10 | true | true |
| chromium | spec | true | true |
| chromium | vroid10 | true | true |
| wkwebview-scheme | spec | true | true |
| wkwebview-scheme | vroid10 | true | true |
| wkwebview-loopback | spec | true | true |
| wkwebview-loopback | vroid10 | true | true |

### Snapshot / restore (every step after the restore point compared with the straight run)

| runtime | model/driver | from step | same instance | fresh, full | fresh, TRS only | fresh, root+springs+mixer | fresh, no springs | size full / TRS | take ms | restore ms |
|---|---|---|---|---|---|---|---|---|---|---|
| node | spec/crossfade | 130 | true | true | true | false (step 131) | false (step 131) | 62 / 26 KB | 0.224 | 0.245 |
| node | spec/crossfade | 300 | true | true | true | false (step 301) | false (step 301) | 62 / 26 KB | 0.224 | 0.245 |
| node | spec/crossfade | 430 | true | true | true | false (step 431) | false (step 431) | 62 / 26 KB | 0.224 | 0.245 |
| node | spec/timeline | 130 | true | true | true | false (step 131) | false (step 131) | 62 / 26 KB | 0.148 | 0.146 |
| node | spec/timeline | 300 | true | true | true | false (step 301) | false (step 301) | 62 / 26 KB | 0.148 | 0.146 |
| node | spec/timeline | 430 | true | true | true | false (step 431) | false (step 431) | 62 / 26 KB | 0.148 | 0.146 |
| node | vroid10/crossfade | 130 | true | true | true | false (step 131) | false (step 131) | 125 / 44 KB | 0.193 | 0.232 |
| node | vroid10/crossfade | 300 | true | true | true | false (step 301) | false (step 301) | 125 / 44 KB | 0.193 | 0.232 |
| node | vroid10/crossfade | 430 | true | true | true | false (step 431) | false (step 431) | 125 / 44 KB | 0.193 | 0.232 |
| node | vroid10/timeline | 130 | true | true | true | false (step 131) | false (step 131) | 125 / 44 KB | 0.207 | 0.231 |
| node | vroid10/timeline | 300 | true | true | true | false (step 301) | false (step 301) | 125 / 44 KB | 0.207 | 0.231 |
| node | vroid10/timeline | 430 | true | true | true | false (step 431) | false (step 431) | 125 / 44 KB | 0.207 | 0.231 |
| chromium | spec/crossfade | 130 | true | true | true | false (step 131) | false (step 131) | 62 / 26 KB | 0.167 | 0.15 |
| chromium | spec/crossfade | 300 | true | true | true | false (step 301) | false (step 301) | 62 / 26 KB | 0.167 | 0.15 |
| chromium | spec/crossfade | 430 | true | true | true | false (step 431) | false (step 431) | 62 / 26 KB | 0.167 | 0.15 |
| chromium | spec/timeline | 130 | true | true | true | false (step 131) | false (step 131) | 62 / 26 KB | 0.133 | 0.083 |
| chromium | spec/timeline | 300 | true | true | true | false (step 301) | false (step 301) | 62 / 26 KB | 0.133 | 0.083 |
| chromium | spec/timeline | 430 | true | true | true | false (step 431) | false (step 431) | 62 / 26 KB | 0.133 | 0.083 |
| chromium | vroid10/crossfade | 130 | true | true | true | false (step 131) | false (step 131) | 125 / 44 KB | 0.2 | 0.167 |
| chromium | vroid10/crossfade | 300 | true | true | true | false (step 301) | false (step 301) | 125 / 44 KB | 0.2 | 0.167 |
| chromium | vroid10/crossfade | 430 | true | true | true | false (step 431) | false (step 431) | 125 / 44 KB | 0.2 | 0.167 |
| chromium | vroid10/timeline | 130 | true | true | true | false (step 131) | false (step 131) | 125 / 44 KB | 0.167 | 0.117 |
| chromium | vroid10/timeline | 300 | true | true | true | false (step 301) | false (step 301) | 125 / 44 KB | 0.167 | 0.117 |
| chromium | vroid10/timeline | 430 | true | true | true | false (step 431) | false (step 431) | 125 / 44 KB | 0.167 | 0.117 |
| wkwebview-scheme | spec/crossfade | 130 | true | true | true | false (step 131) | false (step 131) | 62 / 26 KB | 0 | 0.167 |
| wkwebview-scheme | spec/crossfade | 300 | true | true | true | false (step 301) | false (step 301) | 62 / 26 KB | 0 | 0.167 |
| wkwebview-scheme | spec/crossfade | 430 | true | true | true | false (step 431) | false (step 431) | 62 / 26 KB | 0 | 0.167 |
| wkwebview-scheme | spec/timeline | 130 | true | true | true | false (step 131) | false (step 131) | 62 / 26 KB | 0 | 0 |
| wkwebview-scheme | spec/timeline | 300 | true | true | true | false (step 301) | false (step 301) | 62 / 26 KB | 0 | 0 |
| wkwebview-scheme | spec/timeline | 430 | true | true | true | false (step 431) | false (step 431) | 62 / 26 KB | 0 | 0 |
| wkwebview-scheme | vroid10/crossfade | 130 | true | true | true | false (step 131) | false (step 131) | 125 / 44 KB | 0 | 0.167 |
| wkwebview-scheme | vroid10/crossfade | 300 | true | true | true | false (step 301) | false (step 301) | 125 / 44 KB | 0 | 0.167 |
| wkwebview-scheme | vroid10/crossfade | 430 | true | true | true | false (step 431) | false (step 431) | 125 / 44 KB | 0 | 0.167 |
| wkwebview-scheme | vroid10/timeline | 130 | true | true | true | false (step 131) | false (step 131) | 125 / 44 KB | 0 | 0.167 |
| wkwebview-scheme | vroid10/timeline | 300 | true | true | true | false (step 301) | false (step 301) | 125 / 44 KB | 0 | 0.167 |
| wkwebview-scheme | vroid10/timeline | 430 | true | true | true | false (step 431) | false (step 431) | 125 / 44 KB | 0 | 0.167 |
| wkwebview-loopback | spec/crossfade | 130 | true | true | true | false (step 131) | false (step 131) | 62 / 26 KB | 0.12 | 0.147 |
| wkwebview-loopback | spec/crossfade | 300 | true | true | true | false (step 301) | false (step 301) | 62 / 26 KB | 0.12 | 0.147 |
| wkwebview-loopback | spec/crossfade | 430 | true | true | true | false (step 431) | false (step 431) | 62 / 26 KB | 0.12 | 0.147 |
| wkwebview-loopback | spec/timeline | 130 | true | true | true | false (step 131) | false (step 131) | 62 / 26 KB | 0.047 | 0.087 |
| wkwebview-loopback | spec/timeline | 300 | true | true | true | false (step 301) | false (step 301) | 62 / 26 KB | 0.047 | 0.087 |
| wkwebview-loopback | spec/timeline | 430 | true | true | true | false (step 431) | false (step 431) | 62 / 26 KB | 0.047 | 0.087 |
| wkwebview-loopback | vroid10/crossfade | 130 | true | true | true | false (step 131) | false (step 131) | 125 / 44 KB | 0.06 | 0.123 |
| wkwebview-loopback | vroid10/crossfade | 300 | true | true | true | false (step 301) | false (step 301) | 125 / 44 KB | 0.06 | 0.123 |
| wkwebview-loopback | vroid10/crossfade | 430 | true | true | true | false (step 431) | false (step 431) | 125 / 44 KB | 0.06 | 0.123 |
| wkwebview-loopback | vroid10/timeline | 130 | true | true | true | false (step 131) | false (step 131) | 125 / 44 KB | 0.06 | 0.117 |
| wkwebview-loopback | vroid10/timeline | 300 | true | true | true | false (step 301) | false (step 301) | 125 / 44 KB | 0.06 | 0.117 |
| wkwebview-loopback | vroid10/timeline | 430 | true | true | true | false (step 431) | false (step 431) | 125 / 44 KB | 0.06 | 0.117 |

### Step time (ms): sim = all characters' driver + mixer.update + vrm.update; matrices = updateMatrixWorld + skeleton.update; wall = both, one interval over 600 steps

| runtime | model | springs | N | mode | wall per step | sim mean / p95 | sim per char | matrices mean / p95 |
|---|---|---|---|---|---|---|---|---|
| node | spec | 4 | 1 | native | 0.1026 | 0.0469 / 0.0614 | 0.0469 | 0.055 / 0.0632 |
| node | spec | 4 | 1 | dmath | 0.1041 | 0.0494 / 0.0591 | 0.0494 | 0.0546 / 0.0606 |
| node | spec | 4 | 5 | native | 0.5382 | 0.2609 / 0.3496 | 0.0522 | 0.2771 / 0.332 |
| node | spec | 4 | 5 | dmath | 0.5462 | 0.2672 / 0.3503 | 0.0534 | 0.2788 / 0.3379 |
| node | spec | 4 | 20 | native | 2.6045 | 1.3441 / 1.7307 | 0.0672 | 1.2601 / 1.5143 |
| node | spec | 4 | 20 | dmath | 2.8548 | 1.5248 / 2.0222 | 0.0762 | 1.3295 / 1.5769 |
| node | vroid10 | 106 | 1 | native | 0.39 | 0.2414 / 0.277 | 0.2414 | 0.1485 / 0.1609 |
| node | vroid10 | 106 | 1 | dmath | 0.3953 | 0.2461 / 0.2733 | 0.2461 | 0.1492 / 0.1653 |
| node | vroid10 | 106 | 5 | native | 2.0721 | 1.2796 / 1.4594 | 0.2559 | 0.7923 / 0.9057 |
| node | vroid10 | 106 | 5 | dmath | 2.2224 | 1.4006 / 1.7007 | 0.2801 | 0.8215 / 0.9975 |
| node | vroid10 | 106 | 20 | native | 8.7904 | 5.5221 / 6.326 | 0.2761 | 3.268 / 3.7606 |
| node | vroid10 | 106 | 20 | dmath | 8.8814 | 5.5665 / 6.2961 | 0.2783 | 3.3146 / 3.7199 |
| chromium | spec | 4 | 1 | native | 0.0805 | 0.0392 / 0.1 | 0.0392 | 0.0412 / 0.1 |
| chromium | spec | 4 | 1 | dmath | 0.0802 | 0.0398 / 0.1 | 0.0398 | 0.0403 / 0.1 |
| chromium | spec | 4 | 5 | native | 0.4062 | 0.1995 / 0.3 | 0.0399 | 0.2065 / 0.3 |
| chromium | spec | 4 | 5 | dmath | 0.4098 | 0.2095 / 0.3 | 0.0419 | 0.2002 / 0.3 |
| chromium | spec | 4 | 20 | native | 1.642 | 0.8195 / 0.9 | 0.041 | 0.8222 / 0.9 |
| chromium | spec | 4 | 20 | dmath | 1.745 | 0.9037 / 1.2 | 0.0452 | 0.8412 / 1 |
| chromium | vroid10 | 106 | 1 | native | 0.3158 | 0.1972 / 0.3 | 0.1972 | 0.1182 / 0.2 |
| chromium | vroid10 | 106 | 1 | dmath | 0.3187 | 0.2055 / 0.3 | 0.2055 | 0.1132 / 0.2 |
| chromium | vroid10 | 106 | 5 | native | 1.573 | 0.9872 / 1.1 | 0.1974 | 0.5858 / 0.7 |
| chromium | vroid10 | 106 | 5 | dmath | 1.6107 | 1.018 / 1.2 | 0.2036 | 0.5927 / 0.7 |
| chromium | vroid10 | 106 | 20 | native | 7.0033 | 4.4133 / 5.2 | 0.2207 | 2.5897 / 3.3 |
| chromium | vroid10 | 106 | 20 | dmath | 6.6117 | 4.1897 / 4.6 | 0.2095 | 2.4215 / 2.6 |
| wkwebview-scheme | spec | 4 | 1 | native | 0.04 | 0.025 / 0 | 0.025 | 0.015 / 0 |
| wkwebview-scheme | spec | 4 | 1 | dmath | 0.04 | 0.0283 / 0 | 0.0283 | 0.0117 / 0 |
| wkwebview-scheme | spec | 4 | 5 | native | 0.2067 | 0.1217 / 1 | 0.0243 | 0.085 / 1 |
| wkwebview-scheme | spec | 4 | 5 | dmath | 0.2083 | 0.1333 / 1 | 0.0267 | 0.075 / 1 |
| wkwebview-scheme | spec | 4 | 20 | native | 0.9033 | 0.5467 / 1 | 0.0273 | 0.3567 / 1 |
| wkwebview-scheme | spec | 4 | 20 | dmath | 0.9283 | 0.585 / 1 | 0.0292 | 0.3433 / 1 |
| wkwebview-scheme | vroid10 | 106 | 1 | native | 0.1417 | 0.1083 / 1 | 0.1083 | 0.0333 / 0 |
| wkwebview-scheme | vroid10 | 106 | 1 | dmath | 0.145 | 0.1083 / 1 | 0.1083 | 0.0367 / 0 |
| wkwebview-scheme | vroid10 | 106 | 5 | native | 0.7483 | 0.525 / 1 | 0.105 | 0.2233 / 1 |
| wkwebview-scheme | vroid10 | 106 | 5 | dmath | 0.76 | 0.5383 / 1 | 0.1077 | 0.2217 / 1 |
| wkwebview-scheme | vroid10 | 106 | 20 | native | 3.165 | 2.2067 / 3 | 0.1103 | 0.9583 / 1 |
| wkwebview-scheme | vroid10 | 106 | 20 | dmath | 3.2267 | 2.26 / 3 | 0.113 | 0.9667 / 1 |
| wkwebview-loopback | spec | 4 | 1 | native | 0.0396 | 0.0241 / 0.04 | 0.0241 | 0.0154 / 0.02 |
| wkwebview-loopback | spec | 4 | 1 | dmath | 0.0406 | 0.0264 / 0.04 | 0.0264 | 0.0142 / 0.02 |
| wkwebview-loopback | spec | 4 | 5 | native | 0.2036 | 0.1257 / 0.14 | 0.0251 | 0.0778 / 0.08 |
| wkwebview-loopback | spec | 4 | 5 | dmath | 0.2097 | 0.1323 / 0.16 | 0.0265 | 0.0774 / 0.08 |
| wkwebview-loopback | spec | 4 | 20 | native | 0.8586 | 0.5322 / 0.62 | 0.0266 | 0.3262 / 0.34 |
| wkwebview-loopback | spec | 4 | 20 | dmath | 0.888 | 0.5605 / 0.64 | 0.028 | 0.3275 / 0.36 |
| wkwebview-loopback | vroid10 | 106 | 1 | native | 0.1383 | 0.0984 / 0.1 | 0.0984 | 0.0399 / 0.04 |
| wkwebview-loopback | vroid10 | 106 | 1 | dmath | 0.1424 | 0.1025 / 0.12 | 0.1025 | 0.0399 / 0.04 |
| wkwebview-loopback | vroid10 | 106 | 5 | native | 0.7218 | 0.51 / 0.54 | 0.102 | 0.2117 / 0.22 |
| wkwebview-loopback | vroid10 | 106 | 5 | dmath | 0.7395 | 0.5297 / 0.56 | 0.1059 | 0.2098 / 0.22 |
| wkwebview-loopback | vroid10 | 106 | 20 | native | 3.0244 | 2.1213 / 2.28 | 0.1061 | 0.9031 / 0.98 |
| wkwebview-loopback | vroid10 | 106 | 20 | dmath | 3.0988 | 2.1913 / 2.4 | 0.1096 | 0.9075 / 1.02 |

### dmath microbenchmark (ns per call)

| runtime | function | native | dmath |
|---|---|---|---|
| node | sin | 4.26 | 7.53 |
| node | cos | 7.69 | 7.33 |
| node | acos | 6.04 | 6.77 |
| node | asin | 6.04 | 7.25 |
| node | atan | 5.87 | 8.46 |
| node | atan2 | 7.71 | 11.92 |
| chromium | sin | 3.95 | 6.6 |
| chromium | cos | 6.85 | 6.75 |
| chromium | acos | 6.65 | 6.35 |
| chromium | asin | 5.95 | 6.55 |
| chromium | atan | 5.7 | 8.15 |
| chromium | atan2 | 7.4 | 10.95 |
| wkwebview-scheme | acos | 4 | 7.5 |
| wkwebview-scheme | asin | 9.5 | 8.5 |
| wkwebview-scheme | atan | 8.5 | 7 |
| wkwebview-scheme | atan2 | 10 | 13 |
| wkwebview-scheme | cos | 4.5 | 10.5 |
| wkwebview-scheme | sin | 2 | 9.5 |
| wkwebview-loopback | acos | 3.92 | 7.89 |
| wkwebview-loopback | asin | 9.96 | 8.67 |
| wkwebview-loopback | atan | 8.82 | 6.73 |
| wkwebview-loopback | atan2 | 9.68 | 12.79 |
| wkwebview-loopback | cos | 4.8 | 11.5 |
| wkwebview-loopback | sin | 2.32 | 7.25 |

