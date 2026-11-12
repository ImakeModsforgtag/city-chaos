# Stores: PC (walk up to the GUN SHOP clerk, E opens the store, buy a gun / armor / ammo, robbed store refuses,
# energy drink boost at GAS & GO, lottery at the ARCADE) and emulated Quest 3 (grip opens the VR store page).
# Needs the server running with CC_TEST=1 (teleport + cash test hook) and public/vr-test.html for the VR part.
import asyncio, os, math
from playwright.async_api import async_playwright
ARGS = ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist']
LOW = "try { const s = JSON.parse(localStorage.getItem('cc_settings') || '{}'); s.quality = 'low'; s.shadows = false; localStorage.setItem('cc_settings', JSON.stringify(s)); } catch (e) {}"
os.makedirs('/tmp/shots', exist_ok=True)
async def goto(P, name, wait=True):
    tgt = await P.evaluate(f"({GO})('{name}')")
    for i in range(40):
        await P.wait_for_timeout(250)
        at = await P.evaluate("(() => { const v = __cc.renderer.xr.isPresenting ? __cc.rig.position : __cc.walker.feet; return [v.x, v.z]; })()")
        if math.hypot(at[0] - tgt[0], at[1] - tgt[2]) < 1.2: break
    await P.wait_for_timeout(900)
H = open(os.path.join(os.path.dirname(__file__), 'quest3_prison_test.py')).read().split('H = """')[1].split('"""')[0]

GO = """(name) => { const s = __cc.map.shops.find(q => q.name === name); const d = 3.0;
  const p = [s.keeper[0] - Math.sin(s.yaw) * d, s.keeper[1], s.keeper[2] - Math.cos(s.yaw) * d];
  __cc.net.send({ type: 'testTp', p, yaw: s.yaw + Math.PI, cash: 3000 }); return p; }"""

async def pc(b):
    P = await b.new_page(viewport={'width': 1100, 'height': 680}); await P.add_init_script(LOW)
    errs = []; P.on('pageerror', lambda e: errs.append(str(e)))
    await P.goto('http://localhost:3000'); await P.wait_for_timeout(2500)
    await P.click('[data-goto=create]'); await P.click('[data-action=create]'); await P.wait_for_timeout(800)
    await P.click('[data-action=desktop]'); await P.wait_for_timeout(1500)
    await goto(P, 'GUN SHOP')
    await P.evaluate("__cc.G.pitch = -0.1"); await P.wait_for_timeout(600)
    print('PC: prompt at the GUN SHOP:', await P.evaluate('__cc.G.prompt'), '| cash', await P.evaluate('__cc.G.players.get(__cc.G.room.you).cash'))
    await P.keyboard.press('KeyE'); await P.wait_for_timeout(700)
    print('PC: E opens the store:', await P.evaluate("!document.getElementById('shopmenu').classList.contains('hidden')"), '| view', await P.evaluate('__cc.G.view'))
    print('PC: items:', await P.evaluate("[...document.querySelectorAll('#shopmenu .sm-item b')].map(b => b.textContent).join(', ')"))
    await P.screenshot(path='/tmp/shots/s1_pc_gunshop.png')
    await P.click('#shopmenu [data-buy=ar]'); await P.wait_for_timeout(900)
    print('PC: bought AR -> holding:', await P.evaluate('__cc.weapons.current.w'), '| cash', await P.evaluate('__cc.G.players.get(__cc.G.room.you).cash'), '| msg:', await P.evaluate("document.querySelector('#shopmenu .sm-msg').textContent"))
    await P.click('#shopmenu [data-buy=heavy]'); await P.wait_for_timeout(900)
    print('PC: heavy armor -> armor', await P.evaluate('__cc.G.me.armor'), '| HUD:', await P.evaluate("document.getElementById('armorbox').textContent"))
    await P.keyboard.press('Digit3'); await P.wait_for_timeout(900)   # key 3 = SMG
    print('PC: number key 3 bought:', await P.evaluate('__cc.weapons.slots.map(s => s.w).join(",")'))
    await P.screenshot(path='/tmp/shots/s2_pc_bought.png')
    await P.keyboard.press('KeyE'); await P.wait_for_timeout(600)
    print('PC: E closes it:', await P.evaluate("document.getElementById('shopmenu').classList.contains('hidden')"), '| still playing:', await P.evaluate('__cc.G.view'))
    # GAS & GO energy drink
    print('PC: no robbery while shopping: clerk state', await P.evaluate("[...__cc.npcs.map.values()].filter(n => n.type === 1).map(n => n.state).join(',')"))
    await goto(P, 'GAS & GO')
    print('PC: position after tp', await P.evaluate('[__cc.walker.feet.x, __cc.walker.feet.z].map(v => v.toFixed(1)).join(",")'), await P.evaluate("JSON.stringify(__cc.map.shops.find(s => s.name === 'GAS & GO'))"))
    print('PC: prompt at GAS & GO:', await P.evaluate('__cc.G.prompt'))
    await P.keyboard.press('KeyE'); await P.wait_for_timeout(600)
    await P.click('#shopmenu [data-buy=energy]'); await P.wait_for_timeout(900)
    print('PC: energy drink -> walker speed x', await P.evaluate('__cc.walker.mods.speed'), 'jump x', await P.evaluate('__cc.walker.mods.jump'), '| HUD:', await P.evaluate("document.getElementById('boostbox').textContent"))
    for i in range(4): await P.click('#shopmenu [data-buy=scratch]'); await P.wait_for_timeout(500)
    print('PC: scratch tickets:', await P.evaluate("document.querySelector('#shopmenu .sm-msg').textContent"))
    await P.screenshot(path='/tmp/shots/s3_pc_gas.png')
    await P.keyboard.press('Escape'); await P.wait_for_timeout(400)
    # walk away closes it / robbed store
    await goto(P, 'DONUTS')
    await P.keyboard.press('KeyE'); await P.wait_for_timeout(500)
    print('PC: open at DONUTS:', await P.evaluate('__cc.G.prompt'), await P.evaluate("document.querySelector('#shopmenu .sm-head b').textContent"))
    await P.evaluate("__cc.net.send({ type: 'testTp', p: [0, 0.1, 0], yaw: 0 })"); await P.wait_for_timeout(1500)
    print('PC: walking away closes the store:', await P.evaluate("document.getElementById('shopmenu').classList.contains('hidden')"))
    # every store opens
    for s in ['SNAX', 'MEGA MART', 'STAR DINER', 'ARCADE']:
        await goto(P, s)
        print(f'PC: {s} prompt:', await P.evaluate('__cc.G.prompt'))
    await P.keyboard.press('KeyE'); await P.wait_for_timeout(500)
    await P.screenshot(path='/tmp/shots/s4_pc_arcade.png')
    print('PC errors:', errs)

async def vr(b):
    P = await b.new_page(viewport={'width': 1000, 'height': 560}); await P.add_init_script(LOW)
    errs = []; P.on('pageerror', lambda e: errs.append(str(e)))
    await P.goto('http://localhost:3000/vr-test.html'); await P.wait_for_timeout(2500)
    await P.click('[data-goto=create]'); await P.click('[data-action=create]'); await P.wait_for_timeout(800)
    await P.evaluate(H); await P.evaluate("__xr.position.set(0, 1.65, 0); __hands([-0.25, 1.3, -0.4], [0.25, 1.3, -0.4])")
    await P.click('[data-action=vr]'); await P.wait_for_timeout(1800)
    await goto(P, 'STAR DINER')
    print('VR: prompt:', await P.evaluate('__cc.G.prompt'))
    await P.evaluate("__xr.controllers.right.updateButtonValue('squeeze', 1)"); await P.wait_for_timeout(400)
    await P.evaluate("__xr.controllers.right.updateButtonValue('squeeze', 0)"); await P.wait_for_timeout(800)
    print('VR: grip opens the store page:', await P.evaluate('__cc.vrui.menuOpen'), await P.evaluate('__cc.vrui.model && __cc.vrui.model.title'))
    await P.screenshot(path='/tmp/shots/s5_vr_diner.png')
    await P.evaluate("__cc.G.me.hp = 40"); await P.evaluate("__cc.menuAction('shop:buy:shake')"); await P.wait_for_timeout(900)
    print('VR: rocket shake -> boost', await P.evaluate('__cc.boosts.boostLeft().toFixed(0)'), 's, gorilla cap x', await P.evaluate('__cc.vrMover.gorilla.capScale'), '| sub:', await P.evaluate('__cc.vrui.model && __cc.vrui.model.sub'), '| menuOpen', await P.evaluate('__cc.vrui.menuOpen'))
    await P.screenshot(path='/tmp/shots/s6_vr_bought.png')
    await P.evaluate("__cc.menuAction('shop:close')"); await P.wait_for_timeout(400)
    print('VR: closed:', not await P.evaluate('__cc.vrui.menuOpen'), await P.evaluate('__cc.shopMenu.shop'))
    print('VR errors:', errs)

async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch(args=ARGS)
        await pc(b); await vr(b)
        await b.close()
if __name__ == '__main__': asyncio.run(main())
