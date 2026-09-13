using Gaffa.Runtime;
using UnityEditor;
using UnityEditor.SceneManagement;
using UnityEngine;
using UnityEngine.SceneManagement;

namespace ProjectBootstrap
{
    /// <summary>
    /// Builds the Moment scene from code so the project is playable without hand-wiring:
    /// pitch, lines, light, camera rig, and a MomentDirector. Menu: Gaffa > Build Moment Scene.
    /// Headless: -executeMethod ProjectBootstrap.SceneBootstrap.BuildMomentScene
    /// </summary>
    public static class SceneBootstrap
    {
        const string ScenePath = "Assets/Gaffa/Scenes/Moment.unity";

        [MenuItem("Gaffa/Build Moment Scene")]
        public static void BuildMomentScene()
        {
            var scene = EditorSceneManager.NewScene(NewSceneSetup.EmptyScene, NewSceneMode.Single);

            // Light
            var sun = new GameObject("Sun").AddComponent<Light>();
            sun.type = LightType.Directional;
            sun.color = new Color(1f, 0.96f, 0.88f);
            sun.intensity = 1.6f;
            sun.shadows = LightShadows.Soft;
            sun.transform.rotation = Quaternion.Euler(52f, -30f, 0f);
            RenderSettings.ambientMode = UnityEngine.Rendering.AmbientMode.Trilight;
            RenderSettings.ambientSkyColor = new Color(0.62f, 0.7f, 0.85f);
            RenderSettings.ambientEquatorColor = new Color(0.35f, 0.45f, 0.4f);
            RenderSettings.ambientGroundColor = new Color(0.12f, 0.25f, 0.15f);

            // Pitch: 60 x 40 metres, engine x along length, engine y across (Unity z).
            var pitch = GameObject.CreatePrimitive(PrimitiveType.Plane);
            pitch.name = "Pitch";
            pitch.transform.position = new Vector3(30f, 0f, 20f);
            pitch.transform.localScale = new Vector3(6f, 1f, 4f); // Plane is 10x10
            pitch.GetComponent<Renderer>().sharedMaterial = LoadOrCreateMaterial("Assets/Gaffa/Materials/Grass.mat", new Color(0.16f, 0.45f, 0.24f));
            var apron = GameObject.CreatePrimitive(PrimitiveType.Plane);
            apron.name = "Apron";
            apron.transform.position = new Vector3(30f, -0.01f, 20f);
            apron.transform.localScale = new Vector3(10f, 1f, 8f);
            apron.GetComponent<Renderer>().sharedMaterial = LoadOrCreateMaterial("Assets/Gaffa/Materials/Apron.mat", new Color(0.12f, 0.35f, 0.2f));
            BuildLines();
            BuildGoal(0f);
            BuildGoal(60f);

            // Director
            var director = new GameObject("MomentDirector").AddComponent<MomentDirector>();
            director.OurKit = LoadOrCreateMaterial("Assets/Gaffa/Materials/KitUs.mat", new Color(1f, 0.85f, 0.3f));
            director.TheirKit = LoadOrCreateMaterial("Assets/Gaffa/Materials/KitThem.mat", new Color(0.9f, 0.22f, 0.39f));

            // Camera
            var camGo = new GameObject("Main Camera");
            camGo.tag = "MainCamera";
            var cam = camGo.AddComponent<Camera>();
            cam.fieldOfView = 62f;
            cam.nearClipPlane = 0.1f;
            cam.farClipPlane = 300f;
            camGo.AddComponent<AudioListener>();
            var rig = camGo.AddComponent<CarrierCamera>();
            rig.Director = director;
            camGo.transform.position = new Vector3(10f, 3f, 20f);
            camGo.AddComponent<UnityEngine.Rendering.Universal.UniversalAdditionalCameraData>();

            System.IO.Directory.CreateDirectory("Assets/Gaffa/Scenes");
            EditorSceneManager.SaveScene(scene, ScenePath);
            EditorBuildSettings.scenes = new[] { new EditorBuildSettingsScene(ScenePath, true) };
            PlayerSettings.defaultInterfaceOrientation = UIOrientation.Portrait;
            PlayerSettings.runInBackground = true;
            AssetDatabase.SaveAssets();
            Debug.Log($"[SceneBootstrap] Built {ScenePath}");
            if (Application.isBatchMode) EditorApplication.Exit(0);
        }

        static void BuildLines()
        {
            var root = new GameObject("Lines");
            var white = LoadOrCreateMaterial("Assets/Gaffa/Materials/Line.mat", new Color(0.95f, 0.95f, 0.95f));
            void Line(float x0, float z0, float x1, float z1)
            {
                var q = GameObject.CreatePrimitive(PrimitiveType.Cube);
                q.name = "Line";
                q.transform.SetParent(root.transform);
                var a = new Vector3(x0, 0.01f, z0);
                var b = new Vector3(x1, 0.01f, z1);
                q.transform.position = (a + b) / 2f;
                q.transform.rotation = Quaternion.LookRotation(b - a);
                q.transform.localScale = new Vector3(0.12f, 0.02f, Vector3.Distance(a, b));
                q.GetComponent<Renderer>().sharedMaterial = white;
                Object.DestroyImmediate(q.GetComponent<Collider>());
            }
            Line(0, 0, 60, 0); Line(0, 40, 60, 40); Line(0, 0, 0, 40); Line(60, 0, 60, 40);
            Line(30, 0, 30, 40);
            // Boxes: 10 deep x 24 wide
            Line(0, 8, 10, 8); Line(0, 32, 10, 32); Line(10, 8, 10, 32);
            Line(60, 8, 50, 8); Line(60, 32, 50, 32); Line(50, 8, 50, 32);
            // Centre circle r=5
            const int n = 40;
            for (var i = 0; i < n; i++)
            {
                var a0 = i / (float)n * Mathf.PI * 2f;
                var a1 = (i + 1) / (float)n * Mathf.PI * 2f;
                Line(30 + Mathf.Cos(a0) * 5f, 20 + Mathf.Sin(a0) * 5f, 30 + Mathf.Cos(a1) * 5f, 20 + Mathf.Sin(a1) * 5f);
            }
        }

        static void BuildGoal(float x)
        {
            var root = new GameObject(x < 30 ? "Goal Ours" : "Goal Theirs");
            var white = LoadOrCreateMaterial("Assets/Gaffa/Materials/Line.mat", Color.white);
            void Post(Vector3 pos, Vector3 scale)
            {
                var p = GameObject.CreatePrimitive(PrimitiveType.Cylinder);
                p.transform.SetParent(root.transform);
                p.transform.position = pos;
                p.transform.localScale = scale;
                p.GetComponent<Renderer>().sharedMaterial = white;
                Object.DestroyImmediate(p.GetComponent<Collider>());
                if (scale.y < 0.5f) p.transform.rotation = Quaternion.Euler(90f, 0f, 0f);
            }
            Post(new Vector3(x, 1f, 17f), new Vector3(0.12f, 1f, 0.12f));
            Post(new Vector3(x, 1f, 23f), new Vector3(0.12f, 1f, 0.12f));
            var bar = GameObject.CreatePrimitive(PrimitiveType.Cylinder);
            bar.transform.SetParent(root.transform);
            bar.transform.position = new Vector3(x, 2f, 20f);
            bar.transform.rotation = Quaternion.Euler(90f, 0f, 0f);
            bar.transform.localScale = new Vector3(0.12f, 3f, 0.12f);
            bar.GetComponent<Renderer>().sharedMaterial = white;
            Object.DestroyImmediate(bar.GetComponent<Collider>());
        }

        static Material LoadOrCreateMaterial(string path, Color color)
        {
            var existing = AssetDatabase.LoadAssetAtPath<Material>(path);
            if (existing != null) return existing;
            System.IO.Directory.CreateDirectory(System.IO.Path.GetDirectoryName(path));
            var shader = Shader.Find("Universal Render Pipeline/Lit");
            var mat = new Material(shader) { color = color };
            mat.SetColor("_BaseColor", color);
            AssetDatabase.CreateAsset(mat, path);
            return mat;
        }
    }
}
