## Hashes after 600 steps (ordered)

| Variant | part-node | part-chromium | part-wkwebview-scheme | part-wkwebview-loopback | Repeatable in every runtime | Same in every runtime |
|---|---|---|---|---|---|---|
| quarks · unseeded (Math.random) | `77db0b05` | `0bf15a73` | `5afd0ba7` | `8eab307a` | no | no |
| quarks · adapter RNG, one stream | `27641e0e` | `e1aaa333` | `da9126ed` | `da9126ed` | yes | no |
| quarks · adapter RNG, per-frame seed | `c70927d7` | `a267fe0e` | `5ff6669f` | `5ff6669f` | yes | no |
| nebula · unseeded | `84e05cf5` | `9625057a` | `5a7fa80e` | `1a5e21ef` | no | no |
| nebula · setSeed | `ec53cfec` | `412a65b6` | `93c60c07` | `93c60c07` | yes | no |
| stateless · closed form (CPU twin) | `e7ebcb91` | `3133df02` | `eef5422c` | `eef5422c` | yes | no |
| quarks · per-frame seed + portable math | `01256b25` | `01256b25` | `01256b25` | `01256b25` | yes | yes |
| nebula · setSeed + portable math | `16b5fbfa` | `16b5fbfa` | `16b5fbfa` | `16b5fbfa` | yes | yes |
| stateless · CPU twin + portable math | `7f10a6b5` | `7f10a6b5` | `7f10a6b5` | `7f10a6b5` | yes | yes |
| three.proton.js · Math.random swap (probe) | `6c31fd6b` | `43c0e248` | `e2508fa7` | `e2508fa7` | yes | no |
| three.proton.js · Math.random swap + portable math (probe) | `942f0926` | `942f0926` | `942f0926` | `942f0926` | yes | yes |
| @newkrok/three-particles · Math.random swap + synthetic clock (probe) | `5c333af9` | `5c333af9` | `5c333af9` | `5c333af9` | yes | yes |

## Scrub

part-node {"quarksFull":{"ordered":true,"unordered":true,"snapshotBytes":7314241,"snapshotMs":13.788,"restoreMs":6.258,"particles":10241},"quarksWindow":{"ordered":false,"unordered":true,"windowFrames":100,"restoreMs":92.02,"emitterStateBytesPerFrame":4294,"particles":10241},"quarksResim":{"ordered":true,"frames":450,"ms":441.561,"msPerFrame":0.981},"nebulaResim":{"ordered":true,"frames":450,"ms":1357.801,"msPerFrame":3.017},"statelessSeek":{"ordered":true,"seekMs":0.045}}
part-chromium {"quarksFull":{"ordered":true,"unordered":true,"snapshotBytes":7314226,"snapshotMs":6.7,"restoreMs":4.7,"particles":10241},"quarksWindow":{"ordered":false,"unordered":true,"windowFrames":100,"restoreMs":65,"emitterStateBytesPerFrame":4294,"particles":10241},"quarksResim":{"ordered":true,"frames":450,"ms":377,"msPerFrame":0.838},"nebulaResim":{"ordered":true,"frames":450,"ms":839.4,"msPerFrame":1.865},"statelessSeek":{"ordered":true,"seekMs":0.1}}
part-wkwebview-scheme {"nebulaResim":{"frames":450,"ms":549,"msPerFrame":1.22,"ordered":true},"quarksFull":{"ordered":true,"particles":10241,"restoreMs":4,"snapshotBytes":7314253,"snapshotMs":5,"unordered":true},"quarksResim":{"frames":450,"ms":253,"msPerFrame":0.562,"ordered":true},"quarksWindow":{"emitterStateBytesPerFrame":4294,"ordered":false,"particles":10241,"restoreMs":45,"unordered":true,"windowFrames":100},"statelessSeek":{"ordered":true,"seekMs":0}}
part-wkwebview-loopback {"nebulaResim":{"frames":450,"ms":558.96,"msPerFrame":1.242,"ordered":true},"quarksFull":{"ordered":true,"particles":10241,"restoreMs":4.28,"snapshotBytes":7314253,"snapshotMs":4.78,"unordered":true},"quarksResim":{"frames":450,"ms":259.52,"msPerFrame":0.577,"ordered":true},"quarksWindow":{"emitterStateBytesPerFrame":4294,"ordered":false,"particles":10241,"restoreMs":46,"unordered":true,"windowFrames":100},"statelessSeek":{"ordered":true,"seekMs":0.04}}

## Pixel scrub

part-chromium {"quarks-full":{"same":true,"ref":"d523a6b1"},"quarks-window":{"same":false,"ref":"d523a6b1"},"nebula-resim":{"same":true,"ref":"1829dcdc"},"stateless-seek":{"same":true,"ref":"467c79df"}}
part-wkwebview-scheme {"nebula-resim":{"ref":"1829dcdc","same":true},"quarks-full":{"ref":"d523a6b1","same":true},"quarks-window":{"ref":"d523a6b1","same":false},"stateless-seek":{"ref":"467c79df","same":true}}
part-wkwebview-loopback {"nebula-resim":{"ref":"1829dcdc","same":true},"quarks-full":{"ref":"d523a6b1","same":true},"quarks-window":{"ref":"d523a6b1","same":false},"stateless-seek":{"ref":"467c79df","same":true}}

## JSON

part-node {"quarks":{"bytes":1929079,"bytesWithoutImages":15366,"systems":7,"loadedSystems":7,"sameState":true,"particles":104},"stateless":{"bytes":2895,"sameState":true}}
part-chromium {"quarks":{"bytes":1929079,"bytesWithoutImages":15366,"systems":7,"loadedSystems":7,"sameState":true,"particles":104},"stateless":{"bytes":2895,"sameState":true}}
part-wkwebview-scheme {"quarks":{"bytes":1929079,"bytesWithoutImages":15366,"loadedSystems":7,"particles":104,"sameState":true,"systems":7},"stateless":{"bytes":2895,"sameState":true}}
part-wkwebview-loopback {"quarks":{"bytes":1929079,"bytesWithoutImages":15366,"loadedSystems":7,"particles":104,"sameState":true,"systems":7},"stateless":{"bytes":2895,"sameState":true}}

## Step CPU ms (mean / p95), draw calls

| Library | Emitters | Live | part-node step | part-chromium step | part-wkwebview-scheme step | part-wkwebview-loopback step | render (last) | draw calls |
|---|---|---|---|---|---|---|---|---|
| quarks | 1 | 9936 | 1.071 / 1.481 | 0.956 / 1.1 | 0.767 / 1 | 0.779 / 0.9 | 0.035 / 0.04 | 1 |
| quarks | 10 | 10114 | 1.024 / 1.229 | 0.895 / 1 | 0.703 / 1 | 0.778 / 0.84 | 0.036 / 0.04 | 1 |
| quarks | 50 | 8924 | 0.848 / 1.046 | 0.751 / 0.9 | 0.72 / 1 | 0.702 / 0.78 | 0.034 / 0.04 | 1 |
| nebula | 1 | 9950 | 4.705 / 6.112 | 3.634 / 4.3 | 2.253 / 3 | 2.207 / 2.48 | 0.044 / 0.06 | 1 |
| nebula | 10 | 10059 | 2.884 / 3.876 | 2.957 / 3.7 | 2.2 / 3 | 2.231 / 2.54 | 0.043 / 0.06 | 1 |
| nebula | 50 | 8945 | 2.425 / 3.02 | 2.364 / 2.8 | 2.057 / 3 | 2.02 / 2.36 | 0.043 / 0.06 | 1 |
| stateless | 1 | 9988 | 0 / 0 | 0.001 / 0 | 0 / 0 | 0 / 0 | 0.009 / 0.02 | 1 |
| stateless | 10 | 10144 | 0 / 0 | 0 / 0 | 0 / 0 | 0 / 0 | 0.016 / 0.02 | 10 |
| stateless | 50 | 9134 | 0.001 / 0.001 | 0 / 0 | 0 / 0 | 0 / 0 | 0.05 / 0.06 | 50 |
| quarks + portable math | 10 | 10114 | 1.057 / 1.292 | 0.884 / 1 | 0.733 / 1 | 0.748 / 0.8 | — | — |
| nebula + portable math | 10 | 10059 | 2.927 / 3.747 | 1.794 / 2 | 1.143 / 2 | 1.069 / 1.24 | — | — |
part-node Node.js/26 timer 0 totalMs 48257 
part-chromium Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) HeadlessChrome/156.0.0.0 Safari/537.36 timer 0.1 totalMs 33672 {"renderer":"WebGL 2.0 (OpenGL ES 3.0 Chromium)","maxPointSize":511}
part-wkwebview-scheme Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) timer 1 totalMs 24057 {"maxPointSize":511,"renderer":"WebGL 2.0"}
part-wkwebview-loopback Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) timer 0.02 totalMs 24061 {"maxPointSize":511,"renderer":"WebGL 2.0"}
