using System;
using System.Diagnostics;
using System.Drawing;
using System.IO;
using System.IO.Compression;
using System.Net;
using System.Net.Sockets;
using System.Reflection;
using System.Text;
using System.Text.RegularExpressions;
using System.Threading;
using System.Windows.Forms;

internal static class LocalAIHubLauncher
{
    private const int RequiredNodeMajor = 20;
    private const int DefaultPort = 4100;
    private const string FallbackNodeVersion = "v22.11.0";
    private const string DefaultRepoSlug = "supadLL/local-ai-hub";
    private const string DefaultSourceArchiveUrl = "https://github.com/supadLL/local-ai-hub/archive/refs/heads/main.zip";
    private const string DefaultBuildVersion = "dev";

    private static Process serverProcess;
    private static DesktopStatusForm statusForm;

    private sealed class NodeRuntime
    {
        public string NodeExe;
        public string NpmCmd;
        public bool IsPortable;
    }

    private sealed class NodeDownload
    {
        public string Version;
        public string DirectoryName;
        public string Url;
    }

    [STAThread]
    public static int Main(string[] args)
    {
        EnableModernTls();
        Application.EnableVisualStyles();
        Application.SetCompatibleTextRenderingDefault(false);

        using (DesktopStatusForm form = new DesktopStatusForm(args))
        {
            statusForm = form;
            Application.Run(form);
            statusForm = null;
            return form.ExitCode;
        }
    }

    private static void EnableModernTls()
    {
        try
        {
            // 3072 is TLS 1.2. This keeps the launcher compatible with older csc targets.
            ServicePointManager.SecurityProtocol = ServicePointManager.SecurityProtocol | (SecurityProtocolType)3072;
        }
        catch
        {
        }
    }

    private static int Run(string[] args)
    {
        bool forceInstall = HasArg(args, "--reinstall");
        bool forceBuild = HasArg(args, "--rebuild");
        bool forceAppUpdate = HasArg(args, "--update-app") || HasArg(args, "--reset-app");
        bool noAppUpdate = HasArg(args, "--no-update-app");
        bool prepareOnly = HasArg(args, "--prepare-only");
        bool noOpen = HasArg(args, "--no-open");

        if (HasArg(args, "--launcher-info"))
        {
            PrintLauncherInfo(args);
            return 0;
        }

        string projectRoot = FindProjectRoot();
        if (projectRoot == null)
        {
            projectRoot = EnsureStandaloneProject(args, forceAppUpdate, noAppUpdate);
        }

        Console.Title = "Local AI Hub";
        WriteHeader("Local AI Hub one-click launcher");
        Console.WriteLine("Project: " + projectRoot);
        Console.WriteLine("Launcher version: " + LauncherVersion());

        EnsureEnvFile(projectRoot);
        int port = ReadPort(projectRoot);
        string url = "http://127.0.0.1:" + port;

        NodeRuntime runtime = EnsureNodeRuntime(projectRoot);
        Console.WriteLine("Node: " + runtime.NodeExe);

        if (forceInstall || NeedInstall(projectRoot))
        {
            RunNpm(runtime.NpmCmd, "ci --no-audit --no-fund", projectRoot, "Installing dependencies");
            TouchInstallStamp(projectRoot);
        }
        else
        {
            Console.WriteLine("Dependencies: already installed");
        }

        if (forceBuild || NeedBuild(projectRoot))
        {
            RunNpm(runtime.NpmCmd, "run build", projectRoot, "Building application");
        }
        else
        {
            Console.WriteLine("Build: already up to date");
        }

        if (prepareOnly)
        {
            Console.WriteLine("Prepare-only mode completed.");
            return 0;
        }

        if (HealthOk(port))
        {
            Console.WriteLine("Local AI Hub is already running at " + url);
            if (!noOpen)
            {
                OpenBrowser(url);
            }
            return 0;
        }

        if (PortOpen(port))
        {
            throw new InvalidOperationException("Port " + port + " is already in use by another program. Close it or change PORT in .env.");
        }

        StartServer(runtime.NodeExe, projectRoot);
        if (!WaitForHealth(port, 90))
        {
            throw new InvalidOperationException("Server did not become healthy within 90 seconds. Check the console output above.");
        }

        Console.ForegroundColor = ConsoleColor.Green;
        Console.WriteLine("Local AI Hub is running: " + url);
        Console.ResetColor();
        if (!noOpen)
        {
            OpenBrowser(url);
        }

        Console.WriteLine();
        Console.WriteLine("Keep this window open while using Local AI Hub.");
        Console.WriteLine("Press Ctrl+C to stop the service.");
        serverProcess.WaitForExit();
        return serverProcess.ExitCode;
    }

    private static bool HasArg(string[] args, string name)
    {
        for (int i = 0; i < args.Length; i++)
        {
            if (string.Equals(args[i], name, StringComparison.OrdinalIgnoreCase))
            {
                return true;
            }
        }
        return false;
    }

    private static string ArgValue(string[] args, string name)
    {
        string prefix = name + "=";
        for (int i = 0; i < args.Length; i++)
        {
            if (string.Equals(args[i], name, StringComparison.OrdinalIgnoreCase) && i + 1 < args.Length)
            {
                return args[i + 1];
            }

            if (args[i].StartsWith(prefix, StringComparison.OrdinalIgnoreCase))
            {
                return args[i].Substring(prefix.Length).Trim('"');
            }
        }
        return null;
    }

    private static void PrintLauncherInfo(string[] args)
    {
        WriteHeader("Local AI Hub launcher info");
        Console.WriteLine("Version: " + LauncherVersion());
        Console.WriteLine("Repository: " + RepoSlug());
        Console.WriteLine("Source archive: " + SourceArchiveUrl());
        Console.WriteLine("Standalone app directory: " + ResolveStandaloneAppRoot(args));
    }

    private static void WriteHeader(string text)
    {
        Console.ForegroundColor = ConsoleColor.Cyan;
        Console.WriteLine("========================================");
        Console.WriteLine(text);
        Console.WriteLine("========================================");
        Console.ResetColor();
    }

    private static string FindProjectRoot()
    {
        string baseDir = AppDomain.CurrentDomain.BaseDirectory;
        string currentDir = Directory.GetCurrentDirectory();
        string found = FindProjectRootFrom(baseDir);
        if (found != null)
        {
            return found;
        }
        return FindProjectRootFrom(currentDir);
    }

    private static string FindProjectRootFrom(string start)
    {
        DirectoryInfo dir = new DirectoryInfo(Path.GetFullPath(start));
        while (dir != null)
        {
            if (IsProjectRootAt(dir.FullName))
            {
                return dir.FullName;
            }
            dir = dir.Parent;
        }
        return null;
    }

    private static bool IsProjectRootAt(string path)
    {
        string packageJson = Path.Combine(path, "package.json");
        if (!File.Exists(packageJson))
        {
            return false;
        }

        string text = File.ReadAllText(packageJson);
        return text.IndexOf("\"name\": \"local-ai-hub\"", StringComparison.OrdinalIgnoreCase) >= 0 ||
               text.IndexOf("\"name\":\"local-ai-hub\"", StringComparison.OrdinalIgnoreCase) >= 0;
    }

    private static string FindProjectRootInside(string start)
    {
        if (IsProjectRootAt(start))
        {
            return Path.GetFullPath(start);
        }

        string[] directories = Directory.GetDirectories(start, "*", SearchOption.AllDirectories);
        for (int i = 0; i < directories.Length; i++)
        {
            if (IsProjectRootAt(directories[i]))
            {
                return directories[i];
            }
        }
        return null;
    }

    private static bool IsProjectRoot(string path)
    {
        if (string.IsNullOrWhiteSpace(path))
        {
            return false;
        }

        return IsProjectRootAt(Path.GetFullPath(path));
    }

    private static string EnsureStandaloneProject(string[] args, bool forceUpdate, bool noUpdate)
    {
        string appRoot = ResolveStandaloneAppRoot(args);
        Directory.CreateDirectory(appRoot);

        bool hasProject = IsProjectRoot(appRoot);
        if (hasProject && !forceUpdate && (noUpdate || !StandaloneNeedsVersionUpdate(appRoot)))
        {
            Console.WriteLine("Using cached Local AI Hub app: " + appRoot);
            return appRoot;
        }

        try
        {
            InstallProjectSnapshot(appRoot, forceUpdate);
            return appRoot;
        }
        catch
        {
            if (hasProject)
            {
                Console.WriteLine("Could not update the cached app. Using the existing local copy instead.");
                return appRoot;
            }
            throw;
        }
    }

    private static string ResolveStandaloneAppRoot(string[] args)
    {
        string fromArg = ArgValue(args, "--app-dir");
        if (!string.IsNullOrWhiteSpace(fromArg))
        {
            return Path.GetFullPath(Environment.ExpandEnvironmentVariables(fromArg));
        }

        string fromEnv = Environment.GetEnvironmentVariable("LOCAL_AI_HUB_APP_DIR");
        if (!string.IsNullOrWhiteSpace(fromEnv))
        {
            return Path.GetFullPath(Environment.ExpandEnvironmentVariables(fromEnv));
        }

        string localAppData = Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData);
        if (string.IsNullOrWhiteSpace(localAppData))
        {
            localAppData = Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.UserProfile), "AppData", "Local");
        }
        return Path.Combine(localAppData, "LocalAIHub", "app");
    }

    private static bool StandaloneNeedsVersionUpdate(string appRoot)
    {
        string version = LauncherVersion();
        if (string.Equals(version, DefaultBuildVersion, StringComparison.OrdinalIgnoreCase))
        {
            return false;
        }

        string marker = VersionMarkerPath(appRoot);
        if (!File.Exists(marker))
        {
            return true;
        }

        string[] existing = File.ReadAllLines(marker);
        string existingVersion = existing.Length > 0 ? existing[0].Trim() : "";
        return existingVersion.Length > 0 && !string.Equals(existingVersion, version, StringComparison.OrdinalIgnoreCase);
    }

    private static void InstallProjectSnapshot(string appRoot, bool forceDownload)
    {
        string url = SourceArchiveUrl();
        string version = LauncherVersion();
        string runtimeRoot = Path.Combine(appRoot, ".local-runtime");
        string downloadRoot = Path.Combine(runtimeRoot, "downloads");
        string extractRoot = Path.Combine(runtimeRoot, "source-extract");
        Directory.CreateDirectory(downloadRoot);

        string zipPath = Path.Combine(downloadRoot, "local-ai-hub-source-" + SafeFileName(version) + ".zip");
        if (forceDownload && File.Exists(zipPath))
        {
            File.Delete(zipPath);
        }

        if (!File.Exists(zipPath))
        {
            Console.WriteLine("Downloading Local AI Hub source...");
            Console.WriteLine(url);
            using (WebClient web = new WebClient())
            {
                web.Headers.Add("User-Agent", "LocalAIHubLauncher/1.0");
                web.DownloadFile(url, zipPath);
            }
        }

        if (Directory.Exists(extractRoot))
        {
            Directory.Delete(extractRoot, true);
        }
        Directory.CreateDirectory(extractRoot);

        Console.WriteLine("Extracting Local AI Hub source...");
        ZipFile.ExtractToDirectory(zipPath, extractRoot);

        string extractedProject = FindProjectRootInside(extractRoot);
        if (extractedProject == null)
        {
            throw new InvalidOperationException("Downloaded source archive does not contain the Local AI Hub project.");
        }

        Console.WriteLine("Installing Local AI Hub app files...");
        ReplaceProjectFiles(extractedProject, appRoot);
        File.WriteAllText(VersionMarkerPath(appRoot), version + Environment.NewLine + url + Environment.NewLine);
    }

    private static void ReplaceProjectFiles(string sourceRoot, string appRoot)
    {
        Directory.CreateDirectory(appRoot);

        DirectoryInfo root = new DirectoryInfo(appRoot);
        FileSystemInfo[] existing = root.GetFileSystemInfos();
        for (int i = 0; i < existing.Length; i++)
        {
            if (IsPreservedAppItem(existing[i].Name))
            {
                continue;
            }

            if ((existing[i].Attributes & FileAttributes.Directory) == FileAttributes.Directory)
            {
                Directory.Delete(existing[i].FullName, true);
            }
            else
            {
                File.Delete(existing[i].FullName);
            }
        }

        CopyDirectory(sourceRoot, appRoot);
    }

    private static bool IsPreservedAppItem(string name)
    {
        return string.Equals(name, ".env", StringComparison.OrdinalIgnoreCase) ||
               string.Equals(name, "data", StringComparison.OrdinalIgnoreCase) ||
               string.Equals(name, ".local-runtime", StringComparison.OrdinalIgnoreCase) ||
               string.Equals(name, "node_modules", StringComparison.OrdinalIgnoreCase);
    }

    private static bool IsSkippedSourceItem(string name)
    {
        return string.Equals(name, ".git", StringComparison.OrdinalIgnoreCase) ||
               string.Equals(name, ".local-runtime", StringComparison.OrdinalIgnoreCase) ||
               string.Equals(name, "node_modules", StringComparison.OrdinalIgnoreCase) ||
               string.Equals(name, "dist", StringComparison.OrdinalIgnoreCase) ||
               string.Equals(name, "public", StringComparison.OrdinalIgnoreCase) ||
               string.Equals(name, "data", StringComparison.OrdinalIgnoreCase) ||
               string.Equals(name, ".env", StringComparison.OrdinalIgnoreCase) ||
               string.Equals(name, "LocalAIHub.exe", StringComparison.OrdinalIgnoreCase);
    }

    private static void CopyDirectory(string source, string target)
    {
        Directory.CreateDirectory(target);

        string[] directories = Directory.GetDirectories(source);
        for (int i = 0; i < directories.Length; i++)
        {
            string name = Path.GetFileName(directories[i]);
            if (IsSkippedSourceItem(name))
            {
                continue;
            }
            CopyDirectory(directories[i], Path.Combine(target, name));
        }

        string[] files = Directory.GetFiles(source);
        for (int i = 0; i < files.Length; i++)
        {
            string name = Path.GetFileName(files[i]);
            if (IsSkippedSourceItem(name))
            {
                continue;
            }
            File.Copy(files[i], Path.Combine(target, name), true);
        }
    }

    private static string VersionMarkerPath(string appRoot)
    {
        return Path.Combine(appRoot, ".local-ai-hub-source-version");
    }

    private static string SafeFileName(string value)
    {
        if (string.IsNullOrWhiteSpace(value))
        {
            value = "dev";
        }

        char[] invalid = Path.GetInvalidFileNameChars();
        for (int i = 0; i < invalid.Length; i++)
        {
            value = value.Replace(invalid[i], '-');
        }
        return value.Replace('/', '-').Replace('\\', '-').Replace(':', '-');
    }

    private static string LauncherVersion()
    {
        string fromEnv = Environment.GetEnvironmentVariable("LOCAL_AI_HUB_BUILD_VERSION");
        if (!string.IsNullOrWhiteSpace(fromEnv))
        {
            return fromEnv.Trim();
        }

        object[] attrs = Assembly.GetExecutingAssembly().GetCustomAttributes(typeof(AssemblyInformationalVersionAttribute), false);
        if (attrs.Length > 0)
        {
            AssemblyInformationalVersionAttribute attr = (AssemblyInformationalVersionAttribute)attrs[0];
            if (!string.IsNullOrWhiteSpace(attr.InformationalVersion))
            {
                return attr.InformationalVersion.Trim();
            }
        }
        return DefaultBuildVersion;
    }

    private static string RepoSlug()
    {
        string fromEnv = Environment.GetEnvironmentVariable("LOCAL_AI_HUB_REPO");
        if (!string.IsNullOrWhiteSpace(fromEnv))
        {
            return fromEnv.Trim();
        }

        string fromDescription = AssemblyDescriptionValue("Repo");
        return string.IsNullOrWhiteSpace(fromDescription) ? DefaultRepoSlug : fromDescription;
    }

    private static string SourceArchiveUrl()
    {
        string fromEnv = Environment.GetEnvironmentVariable("LOCAL_AI_HUB_SOURCE_URL");
        if (!string.IsNullOrWhiteSpace(fromEnv))
        {
            return fromEnv.Trim();
        }

        string fromDescription = AssemblyDescriptionValue("SourceArchiveUrl");
        return string.IsNullOrWhiteSpace(fromDescription) ? DefaultSourceArchiveUrl : fromDescription;
    }

    private static string AssemblyDescriptionValue(string key)
    {
        object[] attrs = Assembly.GetExecutingAssembly().GetCustomAttributes(typeof(AssemblyDescriptionAttribute), false);
        if (attrs.Length == 0)
        {
            return null;
        }

        string description = ((AssemblyDescriptionAttribute)attrs[0]).Description ?? "";
        string marker = key + "=";
        int start = description.IndexOf(marker, StringComparison.OrdinalIgnoreCase);
        if (start < 0)
        {
            return null;
        }

        start += marker.Length;
        int end = description.IndexOf(';', start);
        if (end < 0)
        {
            end = description.Length;
        }
        return description.Substring(start, end - start).Trim();
    }

    private static void EnsureEnvFile(string root)
    {
        string env = Path.Combine(root, ".env");
        if (File.Exists(env))
        {
            return;
        }

        string example = Path.Combine(root, ".env.example");
        if (File.Exists(example))
        {
            File.Copy(example, env);
            Console.WriteLine("Created .env from .env.example");
        }
    }

    private static int ReadPort(string root)
    {
        string envPort = Environment.GetEnvironmentVariable("PORT");
        int parsed;
        if (int.TryParse(envPort, out parsed) && parsed > 0)
        {
            return parsed;
        }

        string env = Path.Combine(root, ".env");
        if (!File.Exists(env))
        {
            return DefaultPort;
        }

        string[] lines = File.ReadAllLines(env);
        for (int i = 0; i < lines.Length; i++)
        {
            string line = lines[i].Trim();
            if (line.StartsWith("PORT=", StringComparison.OrdinalIgnoreCase))
            {
                string value = line.Substring(5).Trim().Trim('"');
                if (int.TryParse(value, out parsed) && parsed > 0)
                {
                    return parsed;
                }
            }
        }
        return DefaultPort;
    }

    private static NodeRuntime EnsureNodeRuntime(string root)
    {
        NodeRuntime local = FindPortableNode(root);
        if (local != null && NodeUsable(local.NodeExe))
        {
            return local;
        }

        NodeRuntime system = FindSystemNode();
        if (system != null && NodeUsable(system.NodeExe))
        {
            return system;
        }

        return DownloadPortableNode(root);
    }

    private static NodeRuntime FindPortableNode(string root)
    {
        string runtimeRoot = Path.Combine(root, ".local-runtime", "node");
        if (!Directory.Exists(runtimeRoot))
        {
            return null;
        }

        string[] nodes = Directory.GetFiles(runtimeRoot, "node.exe", SearchOption.AllDirectories);
        for (int i = 0; i < nodes.Length; i++)
        {
            string nodeExe = nodes[i];
            string npmCmd = Path.Combine(Path.GetDirectoryName(nodeExe), "npm.cmd");
            if (File.Exists(npmCmd))
            {
                return new NodeRuntime { NodeExe = nodeExe, NpmCmd = npmCmd, IsPortable = true };
            }
        }
        return null;
    }

    private static NodeRuntime FindSystemNode()
    {
        string node = FindOnPath("node.exe");
        string npm = FindOnPath("npm.cmd");
        if (node == null || npm == null)
        {
            return null;
        }
        return new NodeRuntime { NodeExe = node, NpmCmd = npm, IsPortable = false };
    }

    private static string FindOnPath(string fileName)
    {
        string path = Environment.GetEnvironmentVariable("PATH") ?? "";
        string[] parts = path.Split(Path.PathSeparator);
        for (int i = 0; i < parts.Length; i++)
        {
            string dir = parts[i].Trim('"');
            if (dir.Length == 0)
            {
                continue;
            }
            string candidate = Path.Combine(dir, fileName);
            if (File.Exists(candidate))
            {
                return candidate;
            }
        }
        return null;
    }

    private static bool NodeUsable(string nodeExe)
    {
        string output = Capture(nodeExe, "--version", Directory.GetCurrentDirectory());
        Match match = Regex.Match(output, @"v(\d+)\.");
        int major;
        return match.Success && int.TryParse(match.Groups[1].Value, out major) && major >= RequiredNodeMajor;
    }

    private static NodeRuntime DownloadPortableNode(string root)
    {
        NodeDownload download = ResolveNodeDownload();
        string runtimeRoot = Path.Combine(root, ".local-runtime", "node");
        string downloadRoot = Path.Combine(root, ".local-runtime", "downloads");
        Directory.CreateDirectory(runtimeRoot);
        Directory.CreateDirectory(downloadRoot);

        string zipPath = Path.Combine(downloadRoot, download.DirectoryName + ".zip");
        string extractPath = Path.Combine(runtimeRoot, download.DirectoryName);
        string nodeExe = Path.Combine(extractPath, "node.exe");
        string npmCmd = Path.Combine(extractPath, "npm.cmd");

        if (!File.Exists(nodeExe) || !File.Exists(npmCmd))
        {
            if (!File.Exists(zipPath))
            {
                Console.WriteLine("Downloading portable Node.js " + download.Version + "...");
                using (WebClient web = new WebClient())
                {
                    web.Headers.Add("User-Agent", "LocalAIHubLauncher/1.0");
                    web.DownloadFile(download.Url, zipPath);
                }
            }

            if (Directory.Exists(extractPath))
            {
                Directory.Delete(extractPath, true);
            }

            Console.WriteLine("Extracting portable Node.js...");
            ZipFile.ExtractToDirectory(zipPath, runtimeRoot);
        }

        return new NodeRuntime { NodeExe = nodeExe, NpmCmd = npmCmd, IsPortable = true };
    }

    private static NodeDownload ResolveNodeDownload()
    {
        string overrideUrl = Environment.GetEnvironmentVariable("LOCAL_AI_HUB_NODE_URL");
        if (!string.IsNullOrWhiteSpace(overrideUrl))
        {
            string dir = Path.GetFileNameWithoutExtension(overrideUrl);
            return new NodeDownload { Version = "custom", DirectoryName = dir, Url = overrideUrl };
        }

        try
        {
            using (WebClient web = new WebClient())
            {
                web.Headers.Add("User-Agent", "LocalAIHubLauncher/1.0");
                string index = web.DownloadString("https://nodejs.org/dist/index.json");
                MatchCollection entries = Regex.Matches(index, "\\{[^\\{\\}]*\\}", RegexOptions.Singleline);
                for (int i = 0; i < entries.Count; i++)
                {
                    string entry = entries[i].Value;
                    Match versionMatch = Regex.Match(entry, "\"version\"\\s*:\\s*\"(v(\\d+)\\.\\d+\\.\\d+)\"");
                    Match ltsMatch = Regex.Match(entry, "\"lts\"\\s*:\\s*(false|\"[^\"]+\")");
                    Match filesMatch = Regex.Match(entry, "\"files\"\\s*:\\s*\\[(.*?)\\]", RegexOptions.Singleline);
                    int major;
                    if (!versionMatch.Success || !int.TryParse(versionMatch.Groups[2].Value, out major) || major < RequiredNodeMajor)
                    {
                        continue;
                    }
                    if (!ltsMatch.Success || ltsMatch.Groups[1].Value == "false")
                    {
                        continue;
                    }
                    if (!filesMatch.Success || filesMatch.Groups[1].Value.IndexOf("\"win-x64\"", StringComparison.OrdinalIgnoreCase) < 0)
                    {
                        continue;
                    }
                    return CreateNodeDownload(versionMatch.Groups[1].Value);
                }
            }
        }
        catch
        {
            // Fallback below.
        }

        return CreateNodeDownload(FallbackNodeVersion);
    }

    private static NodeDownload CreateNodeDownload(string version)
    {
        string dir = "node-" + version + "-win-x64";
        return new NodeDownload
        {
            Version = version,
            DirectoryName = dir,
            Url = "https://nodejs.org/dist/" + version + "/" + dir + ".zip"
        };
    }

    private static bool NeedInstall(string root)
    {
        if (!Directory.Exists(Path.Combine(root, "node_modules")))
        {
            return true;
        }

        string stamp = InstallStampPath(root);
        if (!File.Exists(stamp))
        {
            return true;
        }

        DateTime stampTime = File.GetLastWriteTimeUtc(stamp);
        return FileTime(Path.Combine(root, "package.json")) > stampTime ||
               FileTime(Path.Combine(root, "package-lock.json")) > stampTime;
    }

    private static void TouchInstallStamp(string root)
    {
        string stamp = InstallStampPath(root);
        Directory.CreateDirectory(Path.GetDirectoryName(stamp));
        File.WriteAllText(stamp, DateTime.UtcNow.ToString("o") + Environment.NewLine);
    }

    private static string InstallStampPath(string root)
    {
        return Path.Combine(root, ".local-runtime", "npm-install.stamp");
    }

    private static bool NeedBuild(string root)
    {
        string backend = Path.Combine(root, "dist", "index.js");
        string frontend = Path.Combine(root, "public", "index.html");
        if (!File.Exists(backend) || !File.Exists(frontend))
        {
            return true;
        }

        DateTime output = File.GetLastWriteTimeUtc(backend);
        DateTime frontOutput = File.GetLastWriteTimeUtc(frontend);
        if (frontOutput < output)
        {
            output = frontOutput;
        }

        DateTime source = DateTime.MinValue;
        source = Max(source, LatestWrite(Path.Combine(root, "src")));
        source = Max(source, LatestWrite(Path.Combine(root, "web", "src")));
        source = Max(source, FileTime(Path.Combine(root, "web", "index.html")));
        source = Max(source, FileTime(Path.Combine(root, "web", "postcss.config.js")));
        source = Max(source, FileTime(Path.Combine(root, "web", "tailwind.config.ts")));
        source = Max(source, FileTime(Path.Combine(root, "web", "tsconfig.json")));
        source = Max(source, FileTime(Path.Combine(root, "web", "vite.config.ts")));
        source = Max(source, FileTime(Path.Combine(root, "package.json")));
        source = Max(source, FileTime(Path.Combine(root, "package-lock.json")));
        source = Max(source, FileTime(Path.Combine(root, "tsconfig.json")));
        return source > output;
    }

    private static DateTime LatestWrite(string path)
    {
        if (!Directory.Exists(path))
        {
            return DateTime.MinValue;
        }

        DateTime latest = Directory.GetLastWriteTimeUtc(path);
        string[] files = Directory.GetFiles(path, "*", SearchOption.AllDirectories);
        for (int i = 0; i < files.Length; i++)
        {
            latest = Max(latest, File.GetLastWriteTimeUtc(files[i]));
        }
        return latest;
    }

    private static DateTime FileTime(string path)
    {
        return File.Exists(path) ? File.GetLastWriteTimeUtc(path) : DateTime.MinValue;
    }

    private static DateTime Max(DateTime left, DateTime right)
    {
        return left > right ? left : right;
    }

    private static void RunNpm(string npmCmd, string arguments, string root, string label)
    {
        Console.WriteLine(label + "...");
        int exit = RunCommand("cmd.exe", "/d /s /c call " + Quote(npmCmd) + " " + arguments, root);
        if (exit != 0)
        {
            throw new InvalidOperationException(label + " failed with exit code " + exit + ".");
        }
    }

    private static int RunCommand(string fileName, string arguments, string workingDirectory)
    {
        ProcessStartInfo info = new ProcessStartInfo();
        info.FileName = fileName;
        info.Arguments = arguments;
        info.WorkingDirectory = workingDirectory;
        info.UseShellExecute = false;
        info.RedirectStandardOutput = true;
        info.RedirectStandardError = true;
        info.CreateNoWindow = false;

        using (Process process = new Process())
        {
            process.StartInfo = info;
            process.OutputDataReceived += delegate(object sender, DataReceivedEventArgs e)
            {
                if (e.Data != null)
                {
                    Console.WriteLine(e.Data);
                }
            };
            process.ErrorDataReceived += delegate(object sender, DataReceivedEventArgs e)
            {
                if (e.Data != null)
                {
                    Console.Error.WriteLine(e.Data);
                }
            };
            process.Start();
            process.BeginOutputReadLine();
            process.BeginErrorReadLine();
            process.WaitForExit();
            return process.ExitCode;
        }
    }

    private static string Capture(string fileName, string arguments, string workingDirectory)
    {
        ProcessStartInfo info = new ProcessStartInfo();
        info.FileName = fileName;
        info.Arguments = arguments;
        info.WorkingDirectory = workingDirectory;
        info.UseShellExecute = false;
        info.RedirectStandardOutput = true;
        info.RedirectStandardError = true;
        info.CreateNoWindow = true;

        using (Process process = Process.Start(info))
        {
            string output = process.StandardOutput.ReadToEnd();
            string error = process.StandardError.ReadToEnd();
            process.WaitForExit();
            return output + Environment.NewLine + error;
        }
    }

    private static void StartServer(string nodeExe, string root)
    {
        Console.WriteLine("Starting Local AI Hub...");
        ProcessStartInfo info = new ProcessStartInfo();
        info.FileName = nodeExe;
        info.Arguments = "dist/index.js";
        info.WorkingDirectory = root;
        info.UseShellExecute = false;
        info.RedirectStandardOutput = false;
        info.RedirectStandardError = false;
        info.CreateNoWindow = false;

        serverProcess = Process.Start(info);
        Console.CancelKeyPress += delegate(object sender, ConsoleCancelEventArgs e)
        {
            e.Cancel = true;
            StopServer();
        };
        AppDomain.CurrentDomain.ProcessExit += delegate { StopServer(); };
    }

    private static void StopServer()
    {
        try
        {
            if (serverProcess != null && !serverProcess.HasExited)
            {
                Console.WriteLine("Stopping Local AI Hub...");
                serverProcess.Kill();
                serverProcess.WaitForExit(5000);
            }
        }
        catch
        {
        }
    }

    private static bool WaitForHealth(int port, int timeoutSeconds)
    {
        DateTime deadline = DateTime.UtcNow.AddSeconds(timeoutSeconds);
        while (DateTime.UtcNow < deadline)
        {
            if (HealthOk(port))
            {
                return true;
            }
            Thread.Sleep(1000);
        }
        return false;
    }

    private static bool HealthOk(int port)
    {
        try
        {
            using (WebClient web = new WebClient())
            {
                web.Headers.Add("User-Agent", "LocalAIHubLauncher/1.0");
                string text = web.DownloadString("http://127.0.0.1:" + port + "/health");
                return text.IndexOf("\"ok\":true", StringComparison.OrdinalIgnoreCase) >= 0 &&
                       text.IndexOf("\"service\":\"local-ai-hub\"", StringComparison.OrdinalIgnoreCase) >= 0;
            }
        }
        catch
        {
            return false;
        }
    }

    private static bool PortOpen(int port)
    {
        try
        {
            using (TcpClient client = new TcpClient())
            {
                IAsyncResult result = client.BeginConnect("127.0.0.1", port, null, null);
                bool ok = result.AsyncWaitHandle.WaitOne(500);
                if (!ok)
                {
                    return false;
                }
                client.EndConnect(result);
                return true;
            }
        }
        catch
        {
            return false;
        }
    }

    private static void OpenBrowser(string url)
    {
        try
        {
            ProcessStartInfo info = new ProcessStartInfo();
            info.FileName = url;
            info.UseShellExecute = true;
            Process.Start(info);
        }
        catch
        {
            Console.WriteLine("Open this address in your browser: " + url);
        }
    }

    private static string Quote(string value)
    {
        return "\"" + value.Replace("\"", "\\\"") + "\"";
    }
}
