# Day and night + weather in the browser: noon, sunset, night (streetlights, lit windows, stars, headlights),
# rain, a thunderstorm. Uses the CC_TEST testClock message to pin the hour / weather. Needs CC_TEST=1 on :3000.
import asyncio, os, sys
from playwright.async_api import async_playwright
ARGS = ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist']
LOW = "try { const s = JSON.parse(localStorage.getItem('cc_settings') || '{}'); s.quality = 'low'; s.shadows = false; localStorage.setItem('cc_settings', JSON.stringify(s)); localStorage.setItem('cc_tut', '1'); } catch (e) {}"
os.makedirs('/tmp/shots', exist_ok=True)
SHOTS = [('noon', 12, None), ('sunset', 19, None), ('night', 23, None), ('rain', 14, 'rain'), ('storm', 22, 'storm')]
if len(sys.argv) > 1: SHOTS = [s for s in SHOTS if s[0] in sys.argv[1:]]
async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch(args=ARGS)
        A = await (await b.new_context(viewport={'width': 1000, 'height': 620})).new_page(); await A.add_init_script(LOW)
        errs = []; A.on('pageerror', lambda e: errs.append(str(e)))
        await A.goto('http://localhost:3000'); await A.wait_for_timeout(2500)
        await A.click('[data-goto=create]'); await A.click('[data-action=create]'); await A.wait_for_timeout(1500)
        await A.click('[data-action=desktop]'); await A.wait_for_timeout(5000)
        await A.evaluate("__cc.net.send({ type: 'testTp', p: [28, 0.15, 2], yaw: 0.3 })"); await A.wait_for_timeout(2000)
        for name, hour, weather in SHOTS:
            await A.evaluate(f"__cc.net.send({{ type: 'testClock', hour: {hour}, weather: {('\"' + weather + '\"') if weather else 'null'} }})"); await A.wait_for_timeout(1500)
            if weather: await A.evaluate(f"__cc.weather.w = {1 if weather == 'storm' else 0.7}; __cc.weather.flash = {0.9 if weather == 'storm' else 0}")
            await A.wait_for_timeout(1200)
            info = await A.evaluate("JSON.stringify({ h: __cc.dayNight.hour.toFixed(1), day: __cc.dayNight.f.toFixed(2), sun: __cc.dayNight.sun.intensity.toFixed(2), lamps: __cc.dayNight.lampMat.opacity.toFixed(2), weather: __cc.weather ? __cc.weather.kind : '-' })")
            print(name, info)
            await A.screenshot(path=f'/tmp/shots/dn_{name}.png')
        print('errors:', errs)
        await b.close()
asyncio.run(main())
