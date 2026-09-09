"""Exercise the deployment script's actual rsync filters on temporary local trees."""

from pathlib import Path
import re
import shlex
import subprocess
import tempfile
import unittest


SCRIPT = Path(__file__).resolve().parents[2] / "scripts/deploy_xserver_env.sh"


class DeploymentArtifactFiltersTest(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory(prefix="sugutachi-deploy-filters-")
        self.addCleanup(self.temp.cleanup)
        self.root = Path(self.temp.name)
        # Read only the rsync commands. Never execute the deployment script or SSH.
        blocks = re.findall(r"^rsync .*?(?=\n\n)", SCRIPT.read_text(), re.MULTILINE | re.DOTALL)
        self.assertEqual(3, len(blocks))
        self.filters = []
        for block in blocks:
            tokens = shlex.split(block.replace("\\\n", " "))
            args = [tokens[1]]
            if "--delete" in tokens:
                args.append("--delete")
            for index, token in enumerate(tokens):
                if token == "--exclude":
                    args.extend([token, tokens[index + 1]])
            self.filters.append(args)

    def put(self, tree, name, content="fixture"):
        path = self.root / tree / name
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text(content)
        return path

    def sync(self, index, source, destination):
        (self.root / destination).mkdir(parents=True, exist_ok=True)
        subprocess.run(
            ["rsync", *self.filters[index], f"{self.root / source}/", f"{self.root / destination}/"],
            check=True, capture_output=True, text=True,
        )

    def test_artifact_omits_preview_data_and_local_cached_configuration(self):
        private_files = [
            ".env", ".env.prod", "database/dm-preview.sqlite", "database/dm-preview.sqlite-wal",
            "database/dm-preview.sqlite-shm", "database/database.sqlite", "bootstrap/cache/config.php",
            "bootstrap/cache/routes-v7.php", "bootstrap/cache/packages.php", "storage/app/private/photo.jpg",
            "storage/framework/down", "storage/framework/maintenance.php",
        ]
        for name in private_files:
            self.put("source", name)
        self.put("source", "database/migrations/create_messages.php")
        self.put("source", "bootstrap/cache/.gitignore")
        self.sync(0, "source", "artifact")
        for name in private_files:
            self.assertFalse((self.root / "artifact" / name).exists(), name)
        self.assertTrue((self.root / "artifact/database/migrations/create_messages.php").exists())
        self.assertTrue((self.root / "artifact/bootstrap/cache/.gitignore").exists())

    def test_application_sync_protects_runtime_data_and_replaces_stale_cache(self):
        protected = [".env", "database/database.sqlite", "storage/app/private/photo.jpg", "storage/logs/laravel.log", "storage/framework/down", "storage/framework/maintenance.php"]
        for name in protected:
            self.put("remote", name, "keep")
        self.put("artifact", "database/dm-preview.sqlite", "never upload")
        self.put("remote", "bootstrap/cache/config.php", "old configuration")
        self.put("remote", "bootstrap/cache/routes-v7.php", "old routes")
        self.put("artifact", "bootstrap/cache/packages.php", "fresh composer discovery")
        self.put("artifact", "app/example.php", "new code")
        self.sync(1, "artifact", "remote")
        for name in protected:
            self.assertEqual("keep", (self.root / "remote" / name).read_text())
        self.assertFalse((self.root / "remote/database/dm-preview.sqlite").exists())
        self.assertFalse((self.root / "remote/bootstrap/cache/config.php").exists())
        self.assertFalse((self.root / "remote/bootstrap/cache/routes-v7.php").exists())
        self.assertEqual("fresh composer discovery", (self.root / "remote/bootstrap/cache/packages.php").read_text())
        self.assertEqual("new code", (self.root / "remote/app/example.php").read_text())

    def test_public_sync_preserves_nested_staging_and_host_configuration(self):
        protected = ["dev.sugutachi.com/build/app.js", ".well-known/acme-challenge/token", ".user.ini", "index.php", ".htaccess", "php85.cgi"]
        for name in protected:
            self.put("docroot", name, "keep")
            self.put("public", name, "must not replace")
        self.put("docroot", "build/assets/obsolete.js")
        self.put("public", "build/assets/current.js", "current asset")
        self.sync(2, "public", "docroot")
        for name in protected:
            self.assertEqual("keep", (self.root / "docroot" / name).read_text())
        self.assertFalse((self.root / "docroot/build/assets/obsolete.js").exists())
        self.assertEqual("current asset", (self.root / "docroot/build/assets/current.js").read_text())


if __name__ == "__main__":
    unittest.main()
