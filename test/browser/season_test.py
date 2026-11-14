# Holiday event in the browser: snow + the frosty sky, the big tree on the plaza, opening a gift (banner + it disappears),
# the gift count on Tab. Needs CC_TEST=1 on :3000 (turns the event on with a test message).
import asyncio, os
from playwright.async_api import async_playwright
ARGS = ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist']
LOW = "try { const s = JSON.parse(localStorage.getItem('cc_settings') || '{}'); s.quality = 'low'; s.shadows = false; localStorage.setItem('cc_settings', JSON.stringify(s)); localStorage.setItem('cc_tut', '1'); } catch (e) {}"
os.makedirs('/tmp/shots', exist_ok=True)
async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch(args=ARGS)
        A = await (await b.new_context(viewport={'width': 1000, 'height': 620})).new_page(); await A.add_init_script(LOW)
        errs = []; A.on('pageerror', lambda e: errs.append(str(e)))
        await A.goto('http://localhost:3000'); await A.wait_for_timeout(2500)
        await A.click('[data-goto=create]'); await A.click('[data-action=create]'); await A.wait_for_timeout(1500)
        await A.click('[data-action=desktop]'); await A.wait_for_timeout(5000)
        await A.evaluate("__cc.net.send({ type: 'testSeason', on: 1 })"); await A.wait_for_timeout(1500)
        print('season on:', await A.evaluate("__cc.seasonView.on"), '| gifts:', await A.evaluate("__cc.seasonView.gifts.length"))
        await A.evaluate("__cc.net.send({ type: 'testTp', p: [38, 0.15, -14], yaw: 0 })"); await A.wait_for_timeout(2500)
        await A.screenshot(path='/tmp/shots/s1_tree.png')
        g = await A.evaluate("(() => { const g = __cc.seasonView.gifts[0]; return [g.id, g.x, g.y, g.z]; })()")
        for i in range(3):
            await A.evaluate(f"__cc.net.send({{ type: 'testTp', p: [{g[1]} + 1.2, {g[2]}, {g[3]} + 1.2], yaw: Math.atan2(1.2, 1.2) }})"); await A.wait_for_timeout(2000)
            if await A.evaluate("__cc.G.prompt"): break
        print('prompt:', await A.evaluate("__cc.G.prompt"))
        await A.screenshot(path='/tmp/shots/s2_gift.png')
        await A.keyboard.press('KeyE'); await A.wait_for_timeout(1500)
        print('banner:', (await A.inner_text('#levelup')).replace('\n', ' | '), '| hidden:', await A.evaluate(f"!__cc.seasonView.gifts[0].mesh.visible"))
        await A.keyboard.down('Tab'); await A.wait_for_timeout(800)
        print('tab gift count:', 'gifts found today: 1/12' in (await A.evaluate("document.getElementById('missions').innerText")))
        await A.keyboard.up('Tab')
        await A.evaluate("__cc.net.send({ type: 'testSeason', on: 0 })"); await A.wait_for_timeout(2500)
        print('off again:', not await A.evaluate("__cc.seasonView.on"), '| sky restored:', await A.evaluate("__cc.scene.background.getHex() === 0x8fd3ff"))
        print('errors:', errs)
        await b.close()
asyncio.run(main())
