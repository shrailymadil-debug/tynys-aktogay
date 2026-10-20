using System;
using System.Collections;
using System.Collections.Generic;
using System.IO;
using UnityEngine;

namespace Tynys
{
    /// <summary>Opt-in checks and real framebuffer captures. Runs only with --tynys-verify DIR.</summary>
    public sealed class MineVerification : MonoBehaviour
    {
        [RuntimeInitializeOnLoadMethod(RuntimeInitializeLoadType.AfterSceneLoad)]
        static void Install()
        {
            var args=Environment.GetCommandLineArgs();
            if(Array.IndexOf(args,"--tynys-verify")>=0)
                new GameObject("Opt-in verification").AddComponent<MineVerification>();
        }
        IEnumerator Start()
        {
            var args=Environment.GetCommandLineArgs();
            int arg=Array.IndexOf(args,"--tynys-verify");
            if(arg<0||arg+1>=args.Length)yield break;
            string dir=Path.GetFullPath(args[arg+1]);Directory.CreateDirectory(dir);
            var errors=new List<string>();
            Application.logMessageReceived+=(message,trace,type)=>{
                if(type==LogType.Exception||type==LogType.Error||type==LogType.Assert)errors.Add(message);
            };
            Application.targetFrameRate=30;
            yield return null;yield return null;
            var data=FindFirstObjectByType<MineData>();
            var world=FindFirstObjectByType<MineWorld>();
            var hud=FindFirstObjectByType<MineHUD>();
            data.ResetDemo();data.Paused=true;
            if(world.trucks.Length!=14)errors.Add("Expected 14 truck groups");
            if(world.rotors.Length!=6)errors.Add("Expected 6 visual turbines");
            foreach(var mf in world.GetComponentsInChildren<MeshFilter>())
                foreach(var v in mf.sharedMesh.vertices)
                    if(float.IsNaN(v.x)||float.IsInfinity(v.x)||float.IsNaN(v.z)||float.IsInfinity(v.z))
                        errors.Add("Nonfinite mesh: "+mf.name);
            var initialTruck=world.trucks[7].position;
            data.Paused=false;
            yield return new WaitForSecondsRealtime(.3f);
            if(Vector3.Distance(initialTruck,world.trucks[7].position)<.01f)errors.Add("Truck did not animate");
            data.ResetDemo();data.Paused=true;
            float wind=data.State.windMW,feed=data.State.feedTPH;
            yield return Capture(dir,"01-normal");
            data.SetScenario(DemoScenario.Lull);
            if(data.State.windMW>=wind*.1f)errors.Add("Lull did not reduce wind");
            hud.Select("wind");
            yield return Capture(dir,"02-lull");
            data.SetScenario(DemoScenario.LineTrip);
            if(data.State.line2Available||data.State.line2Feed>0)errors.Add("Line2 trip failed");
            hud.Select("line-2");
            yield return Capture(dir,"03-line-trip");
            data.SetScenario(DemoScenario.Kegoc);
            if(data.State.gridCapMW!=180||data.State.gridMW>180.1f)errors.Add("Grid cap failed");
            hud.Select("substation");
            yield return Capture(dir,"04-kegoc");
            data.SetScenario(DemoScenario.HardOre);
            if(data.State.feedTPH>=feed)errors.Add("Hard ore feed unchanged");
            data.SetScenario(DemoScenario.PlanUp);
            if(data.State.feedTPH<=feed)errors.Add("Plan increase failed");
            data.SetScenario(DemoScenario.BessFault);
            if(data.State.bessAvailable||Mathf.Abs(data.State.bessMW)>.001f)errors.Add("BESS fault failed");
            hud.Select("bess");
            yield return Capture(dir,"05-bess-fault");
            data.Endpoint="http://127.0.0.1:18097/ditto/api/2/";
            data.SetLive(true);
            yield return new WaitForSecondsRealtime(6);
            if(data.Paused)errors.Add("Pause leaked into live mode");
            if(data.HasSnapshot||!data.IsStale)errors.Add("Missing live server not marked");
            yield return Capture(dir,"06-offline");
            int liveArg=Array.IndexOf(args,"--tynys-live-test");
            if(liveArg>=0&&liveArg+1<args.Length)
            {
                data.SetLive(false);data.Endpoint=args[liveArg+1];data.SetLive(true);
                yield return new WaitForSecondsRealtime(4);
                if(!data.HasSnapshot||!data.IsConnected||data.IsStale)errors.Add("HTTP fixture not loaded");
                if(data.State.gridCapMW!=260||data.State.trucks.Length!=14)errors.Add("HTTP fixture data mismatch");
                hud.Select("bess");
                yield return Capture(dir,"08-live-fixture");
                float lastPower=data.State.bessMW;
                data.SetLive(false);data.Endpoint="http://127.0.0.1:18097/ditto/api/2/";data.SetLive(true);
                yield return new WaitForSecondsRealtime(6);
                if(!data.HasSnapshot||!data.IsStale||data.State.bessMW!=lastPower)
                    errors.Add("Last live snapshot was not retained on failure");
                yield return Capture(dir,"09-stale-fixture");
            }
            data.SetLive(false);data.ResetDemo();data.Paused=true;
            hud.Select("substation");
            yield return Capture(dir,"07-overview");
            File.WriteAllText(Path.Combine(dir,"verification.txt"),
                errors.Count==0?"PASS: all 7 demo modes, finite geometry, truck animation, missing live server, mode reset and framebuffer captures.\n"+
                (liveArg>=0?"PASS: HTTP fixture from repository publisher, live BESS/grid values, retained stale snapshot.\n":""):
                "FAIL:\n"+string.Join("\n",errors));
            Debug.Log("TYNYS_RUNTIME_VERIFICATION "+(errors.Count==0?"PASS":"FAIL"));
            Application.Quit(errors.Count==0?0:1);
        }
        static IEnumerator Capture(string dir,string name)
        {
            yield return null;
            yield return new WaitForEndOfFrame();
            var texture=ScreenCapture.CaptureScreenshotAsTexture();
            if(texture==null)throw new InvalidOperationException("Framebuffer capture failed");
            File.WriteAllBytes(Path.Combine(dir,name+".png"),texture.EncodeToPNG());
            Destroy(texture);
        }
    }
}
