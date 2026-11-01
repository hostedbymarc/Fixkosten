# Import-Hänger 31.10.2026, Chromium-Lauf 2 (ipad-landscape)

Test: `e2e/layout-phase2.spec.ts › Layout Phase 2 (gemessen) › Positionen screen` (Fixture `app`, Import des Oktober-Fixtures),
Commit a7504d9, Chromium 141.0.7390.37 (headless shell).

## Signatur (maschinell, `environmentHangSignature`)

- Import committed: ja (letzter Schritt `livequery-dataset {"loaded":true}`)
- `Debugger.pause`: Timeout, Haupt-Thread antwortet nicht
- Renderer-Trace-Events: 0 (10.676 Events gesamt, alle aus Browser/GPU)
- → `matches: true`

## Nativer Stack (Renderer, Thread 1, `native/renderer-17259/gdb-bt.txt`)

```
#7  base::WaitableEvent::Wait()
#8  font_service::internal::FontServiceThread::FontRenderStyleForStrike(...)
#9  content::WebSandboxSupportLinux::GetWebFontRenderStyleForStrike(...)
#10 blink::FontPlatformData::FontPlatformData(...)
#11 blink::FontCache::CreateFontPlatformData(...)
#14 blink::FontCache::GetLastResortFallbackFont(...)
#15 blink::RemoteFontFaceSource::CreateFontData(...)
...
#24 blink::InlineNode::PrepareLayout(...)
... blink::FlexLayoutAlgorithm / BlockLayoutAlgorithm (Layout)
```

Prozess `S (sleeping)`, wchan `futex_do_wait`, CPU 1,4 % über 5 s. Der Haupt-Thread wartet ohne Timeout
auf die Antwort eines synchronen Mojo-Aufrufs an den Font-Service des Browser-Prozesses (fontconfig),
mitten im Layout. GPU-Prozess: idle in `MessagePumpDefault::Run`.

## Einstufung: b (vollständig in Chromium, IPC)

Kein JavaScript-Frame, keine Stelle aus unserem Code: Die App hat den Import abgeschlossen, Blink legt das
Ergebnis aus und bleibt im synchronen Font-IPC zum Browser hängen. Das deckt sich mit dem Dump vom Vormittag
(`../2026-10-31-ipad-landscape/`: Haupt-Thread antwortet nicht, 0 Renderer-Events nach dem Commit).

Folge nach dem Entscheidungsbaum: Testumgebungsfehler. Ab Commit nach a7504d9 wird genau dieser Hänger
(Signatur maschinell geprüft) höchstens einmal je Lauf in einem frischen Browser-Prozess wiederholt
(`e2e/fixtures.ts`, `envHangRetryGate`; `playwright.config.ts`, `retries: 1`); jeder andere Retry schlägt sofort fehl.
