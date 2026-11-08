# Requires Playwright + Chrome, and a test page public/vr-test.html that loads Meta IWER
# (npm i iwer; copy node_modules/iwer/build/iwer.module.js to public/vendor/iwer-test.js;
#  vr-test.html = index.html plus a module script: new XRDevice(metaQuest3).installRuntime({forceInstall:true})).
# Remove both files again before deploying.
import asyncio
from playwright.async_api import async_playwright
URL='http://localhost:3000'
ARGS=['--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader','--ignore-gpu-blocklist']
async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch(executable_path='/usr/bin/google-chrome', headless=True, args=ARGS)
        B = await b.new_page(viewport={'width':640,'height':400}); errs=[]
        B.on('pageerror', lambda e: errs.append(str(e)))
        await B.goto(URL + '/vr-test.html'); await B.wait_for_timeout(2500)
        await B.click('[data-goto=create]'); await B.click('[data-action=create]'); await B.wait_for_timeout(800)
        await B.click('[data-action=vr]'); await B.wait_for_timeout(1500)
        out = await B.evaluate("""(async () => {
          const cc = __cc; const sent = []; const orig = cc.net.send.bind(cc.net);
          cc.net.send = (m) => { if (m.type === 'pickup') sent.push(m.id); return orig(m); };
          const it = cc.pickups.items.find(i => i.avail && i.def.kind === 'weapon' && i.def.p[1] < 2);
          // stand next to it (client-side), then reach the right hand to it
          cc.rig.position.set(it.def.p[0], 0.15, it.def.p[2] + 0.5);
          for (let k = 0; k < 20; k++) {
            cc.rig.updateMatrixWorld(true);
            const v = it.g.position.clone(); cc.rig.worldToLocal(v);
            __xr.controllers.right.position.set(v.x, v.y, v.z);
            __xr.controllers.left.position.set(v.x - 0.4, v.y + 0.3, v.z);
            await new Promise(r => setTimeout(r, 60));
          }
          const prompt = cc.G.prompt;
          __xr.controllers.right.updateButtonValue('squeeze', 1);
          await new Promise(r => setTimeout(r, 400));
          __xr.controllers.right.updateButtonValue('squeeze', 0);
          return { target: it.def.id, weapon: it.def.weapon, sent, prompt, highlight: it.highlight };
        })()""")
        print('VR grab:', out)
        print('errors:', errs[:3] or 'none')
        await b.close()
asyncio.run(main())
