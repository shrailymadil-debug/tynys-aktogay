using System;
using System.Collections.Generic;
using System.IO;
using UnityEditor;
using UnityEditor.Build.Reporting;
using UnityEditor.SceneManagement;
using UnityEngine;
using UnityEngine.Rendering;

namespace Tynys.Editor
{
    public static class TynysBuilder
    {
        public const string ScenePath="Assets/Tynys/Scenes/TynysMine.unity";

        [MenuItem("Tynys/Build editable mine scene")]
        public static void CreateScene()
        {
            EditorSceneManager.NewScene(NewSceneSetup.EmptyScene,NewSceneMode.Single);
            Directory.CreateDirectory("Assets/Tynys/Generated");
            Directory.CreateDirectory("Assets/Tynys/Scenes");
            AssetDatabase.Refresh();
            var root=new GameObject("TYNYS · Digital Mine");
            var data=root.AddComponent<MineData>();
            var world=root.AddComponent<MineWorld>();
            var hud=root.AddComponent<MineHUD>();
            var camera=new GameObject("Обзорная камера",typeof(Camera),typeof(AudioListener),typeof(MineCamera));
            camera.tag="MainCamera";
            var cam=camera.GetComponent<Camera>();
            cam.clearFlags=CameraClearFlags.SolidColor;
            cam.backgroundColor=new Color(.035f,.065f,.085f);
            cam.orthographic=true;cam.orthographicSize=55;cam.farClipPlane=500;cam.nearClipPlane=.1f;
            cam.allowHDR=true;cam.allowMSAA=true;
            camera.transform.position=new Vector3(0,108,-112);
            camera.transform.LookAt(new Vector3(0,-3,0));
            var rig=camera.GetComponent<MineCamera>();
            world.data=data;world.hud=hud;world.viewCamera=cam;world.cameraRig=rig;
            hud.data=data;hud.cameraRig=rig;
            world.Build();
            var sun=new GameObject("Солнце · мягкие тени",typeof(Light));
            sun.transform.rotation=Quaternion.Euler(52,-28,0);
            var light=sun.GetComponent<Light>();light.type=LightType.Directional;light.color=new Color(1,.94f,.82f);
            light.intensity=1.05f;light.shadows=LightShadows.Soft;light.shadowStrength=.55f;light.shadowBias=.03f;
            RenderSettings.ambientMode=AmbientMode.Trilight;
            RenderSettings.ambientSkyColor=new Color(.55f,.65f,.72f);
            RenderSettings.ambientEquatorColor=new Color(.42f,.48f,.51f);
            RenderSettings.ambientGroundColor=new Color(.28f,.26f,.25f);
            RenderSettings.skybox=null;RenderSettings.fog=false;
            QualitySettings.antiAliasing=4;QualitySettings.shadowDistance=250;
            QualitySettings.shadows=ShadowQuality.All;QualitySettings.shadowResolution=ShadowResolution.High;
            QualitySettings.vSyncCount=1;
            PlayerSettings.productName="Тыныс · Актогай";
            PlayerSettings.companyName="Tynys";
            PlayerSettings.defaultScreenWidth=1600;PlayerSettings.defaultScreenHeight=900;
            PlayerSettings.fullScreenMode=FullScreenMode.Windowed;
            PlayerSettings.resizableWindow=true;PlayerSettings.runInBackground=true;
            PlayerSettings.colorSpace=ColorSpace.Linear;
            PlayerSettings.allowUnsafeCode=false;
            PlayerSettings.insecureHttpOption=InsecureHttpOption.DevelopmentOnly;
            // The project uses the built-in Input API and no external packages.
            var settings=new SerializedObject(AssetDatabase.LoadAllAssetsAtPath("ProjectSettings/ProjectSettings.asset")[0]);
            var input=settings.FindProperty("activeInputHandler");
            if(input!=null){input.intValue=0;settings.ApplyModifiedPropertiesWithoutUndo();}
            SaveGeneratedAssets(root);
            EditorSceneManager.SaveScene(EditorSceneManager.GetActiveScene(),ScenePath);
            EditorBuildSettings.scenes=new[]{new EditorBuildSettingsScene(ScenePath,true)};
            AssetDatabase.SaveAssets();
            Debug.Log("TYNYS_SCENE_OK "+ScenePath);
        }

        static void SaveGeneratedAssets(GameObject root)
        {
            var seen=new HashSet<UnityEngine.Object>();int index=0;
            foreach(var r in root.GetComponentsInChildren<Renderer>())
                foreach(var m in r.sharedMaterials)
                    if(m!=null&&seen.Add(m)&&string.IsNullOrEmpty(AssetDatabase.GetAssetPath(m)))
                        AssetDatabase.CreateAsset(m,"Assets/Tynys/Generated/Material_"+(index++)+".mat");
            index=0;
            foreach(var f in root.GetComponentsInChildren<MeshFilter>())
            {
                var mesh=f.sharedMesh;
                if(mesh!=null&&seen.Add(mesh)&&string.IsNullOrEmpty(AssetDatabase.GetAssetPath(mesh)))
                    AssetDatabase.CreateAsset(mesh,"Assets/Tynys/Generated/Mesh_"+(index++)+".asset");
            }
        }

        [MenuItem("Tynys/Build Windows demo")]
        public static void BuildWindows()
        {
            if(!File.Exists(ScenePath))CreateScene();
            string path=Environment.GetEnvironmentVariable("TYNYS_BUILD_PATH");
            if(string.IsNullOrEmpty(path))path="Builds/Windows/Tynys.exe";
            Directory.CreateDirectory(Path.GetDirectoryName(path));
            var report=BuildPipeline.BuildPlayer(new BuildPlayerOptions{
                scenes=new[]{ScenePath},locationPathName=path,target=BuildTarget.StandaloneWindows64,
                options=BuildOptions.Development});
            if(report.summary.result!=BuildResult.Succeeded)
                throw new Exception("Windows build failed: "+report.summary.result);
            Debug.Log("TYNYS_BUILD_OK "+path);
        }

        public static void CreateAndBuild()
        {
            CreateScene();
            ValidateScene();
            BuildWindows();
        }

        [MenuItem("Tynys/Validate scene")]
        public static void ValidateScene()
        {
            var world=UnityEngine.Object.FindFirstObjectByType<MineWorld>();
            if(world==null)throw new Exception("MineWorld missing");
            if(world.trucks.Length!=14||world.rotors.Length!=6||world.stockpiles.Length!=2||world.mills.Length!=2)
                throw new Exception("Unexpected scene object counts");
            if(world.data==null||world.hud==null||world.cameraRig==null)throw new Exception("Missing scene binding");
            foreach(var t in world.trucks)if(t==null)throw new Exception("Missing truck");
            foreach(var f in world.GetComponentsInChildren<MeshFilter>())
                if(f.sharedMesh==null)throw new Exception("Missing persisted mesh: "+f.name);
            if(world.GetComponentsInChildren<MineObject>().Length<30)throw new Exception("Missing selection IDs");
            Debug.Log("TYNYS_VALIDATE_OK · 14 truck groups, 6 turbines, 2 stockpiles, 2 lines");
        }

        [MenuItem("Tynys/Render scene preview")]
        public static void RenderPreview()
        {
            EditorSceneManager.OpenScene(ScenePath);
            var camera=Camera.main;
            camera.rect=new Rect(0,0,1,1);camera.orthographicSize=68;
            camera.transform.position=new Vector3(20,105,-130);camera.transform.LookAt(new Vector3(0,-1,0));
            var rt=new RenderTexture(1920,1080,24);
            camera.targetTexture=rt;camera.Render();
            RenderTexture.active=rt;
            var texture=new Texture2D(1920,1080,TextureFormat.RGB24,false);
            texture.ReadPixels(new Rect(0,0,1920,1080),0,0);texture.Apply();
            Directory.CreateDirectory("Builds");
            File.WriteAllBytes("Builds/Tynys-Scene.png",texture.EncodeToPNG());
            camera.targetTexture=null;RenderTexture.active=null;
            UnityEngine.Object.DestroyImmediate(rt);UnityEngine.Object.DestroyImmediate(texture);
            Debug.Log("TYNYS_PREVIEW_OK");
        }
    }
}
