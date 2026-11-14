# Apartments in the browser (PC): the APARTMENTS door, buying, going home, the room + trophy shelf, the nap,
# leaving through the door. Needs a CC_TEST=1 server on :3000.
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
        await A.evaluate("__cc.net.send({ type: 'testXp', amt: 2500 })"); await A.wait_for_timeout(500)
        D = await A.evaluate("__cc.map.aptDoor.keeper")
        for i in range(3):
            await A.evaluate(f"__cc.net.send({{ type: 'testTp', p: [{D[0]}, {D[1]}, {D[2]} - 1.2], yaw: Math.PI, cash: 9000 }})"); await A.wait_for_timeout(2000)
            if await A.evaluate("__cc.G.prompt"): break
        print('prompt:', await A.evaluate("__cc.G.prompt"))
        await A.screenshot(path='/tmp/shots/a1_door.png')
        await A.keyboard.press('KeyE'); await A.wait_for_timeout(800)
        await A.click('[data-buy="buy"]'); await A.wait_for_timeout(1200)
        print('after buy:', await A.inner_text('#shopmenu .sm-msg.good') if await A.query_selector('#shopmenu .sm-msg.good') else await A.inner_text('#shopmenu'))
        await A.click('[data-buy="home"]'); await A.wait_for_timeout(3000)
        print('home:', await A.evaluate("JSON.stringify([__cc.walker.feet.x.toFixed(1), __cc.walker.feet.y.toFixed(1), __cc.walker.feet.z.toFixed(1), __cc.aptView.here])"), '| toast:', await A.evaluate("document.getElementById('toast')?.textContent"))
        await A.screenshot(path='/tmp/shots/a2_home.png')
        # look at the shelf (turn around: the shelf is at the front wall)
        u = await A.evaluate("__cc.map.apts[__cc.aptView.here]")
        await A.evaluate(f"__cc.net.send({{ type: 'testTp', p: [{u['x0']} + 5, {u['y']}, {u['z0']} + 3.2], yaw: 0 }})"); await A.wait_for_timeout(2000)
        await A.screenshot(path='/tmp/shots/a3_shelf.png')
        # nap
        await A.evaluate(f"__cc.net.send({{ type: 'testTp', p: [{u['bed'][0]} + 1.5, {u['y']}, {u['bed'][2]} + 1.2], yaw: 0 }})"); await A.wait_for_timeout(1500)
        print('bed prompt:', await A.evaluate("__cc.G.prompt"))
        await A.keyboard.press('KeyE'); await A.wait_for_timeout(1000)
        print('nap toast:', await A.evaluate("document.getElementById('toast')?.textContent"))
        # leave
        await A.evaluate(f"__cc.net.send({{ type: 'testTp', p: [{u['door'][0]}, {u['y']}, {u['door'][2]} - 0.8], yaw: Math.PI }})"); await A.wait_for_timeout(1500)
        print('door prompt:', await A.evaluate("__cc.G.prompt"))
        await A.keyboard.press('KeyE'); await A.wait_for_timeout(2500)
        print('outside:', await A.evaluate("JSON.stringify([__cc.walker.feet.x.toFixed(1), __cc.walker.feet.y.toFixed(1), __cc.walker.feet.z.toFixed(1), __cc.aptView.here])"))
        print('errors:', errs)
        await b.close()
asyncio.run(main())
