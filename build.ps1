# SPDX-License-Identifier: GPL-3.0-or-later
# Builds CarView.apk without Gradle: aapt2 -> javac -> d8 -> zipalign -> apksigner.
# Tools live in %USERPROFILE%\carview-tools (Microsoft OpenJDK 17 + Android SDK 34).
$ErrorActionPreference = 'Stop'
$proj  = $PSScriptRoot
$tools = Join-Path $env:USERPROFILE 'carview-tools'
$jdk   = (Get-ChildItem $tools -Directory -Filter 'jdk-17*' | Select-Object -First 1).FullName
$sdk   = Join-Path $tools 'android-sdk'
$bt    = Join-Path $sdk 'build-tools\34.0.0'
$jar   = Join-Path $sdk 'platforms\android-34\android.jar'
$env:JAVA_HOME = $jdk
$env:PATH = "$jdk\bin;$env:PATH"

$out = Join-Path $proj 'build'
if (Test-Path $out) { Remove-Item $out -Recurse -Force }
New-Item -ItemType Directory -Force "$out\gen", "$out\classes", "$out\dex" | Out-Null

function Run($exe, [string[]]$a) {
    & $exe @a
    if ($LASTEXITCODE -ne 0) { throw "$([IO.Path]::GetFileName($exe)) failed with exit code $LASTEXITCODE" }
}

Write-Host '1/6 resources'
Run "$bt\aapt2.exe" @('compile', '--dir', "$proj\res", '-o', "$out\res.zip")
Run "$bt\aapt2.exe" @('link', '-o', "$out\base.apk", '-I', $jar, '--manifest', "$proj\AndroidManifest.xml",
    "$out\res.zip", '--java', "$out\gen", '--min-sdk-version', '26', '--target-sdk-version', '34')

Write-Host '2/6 java'
$src = @(Get-ChildItem "$proj\src", "$out\gen" -Recurse -Filter *.java | ForEach-Object FullName)
Run "$jdk\bin\javac.exe" (@('--release', '11', '-encoding', 'UTF-8',
    '-classpath', $jar, '-d', "$out\classes") + $src)

Write-Host '3/6 dex'
$classes = @(Get-ChildItem "$out\classes" -Recurse -Filter *.class | ForEach-Object FullName)
Run "$bt\d8.bat" (@('--release', '--lib', $jar, '--min-api', '26', '--output', "$out\dex") + $classes)

Write-Host '4/6 package'
Add-Type -AssemblyName System.IO.Compression, System.IO.Compression.FileSystem
$zip = [IO.Compression.ZipFile]::Open("$out\base.apk", 'Update')
[void][IO.Compression.ZipFileExtensions]::CreateEntryFromFile($zip, "$out\dex\classes.dex", 'classes.dex')
# assets added by hand so entry names use forward slashes (aapt2 on Windows writes backslashes)
$assetRoot = (Resolve-Path "$proj\assets").Path
Get-ChildItem $assetRoot -Recurse -File | ForEach-Object {
    $rel = 'assets/' + $_.FullName.Substring($assetRoot.Length + 1).Replace('\', '/')
    [void][IO.Compression.ZipFileExtensions]::CreateEntryFromFile($zip, $_.FullName, $rel)
}
$zip.Dispose()
Run "$bt\zipalign.exe" @('-p', '-f', '4', "$out\base.apk", "$out\aligned.apk")

Write-Host '5/6 sign'
# The signing key lives outside the repository (never commit it): CARVIEW_KEYSTORE_DIR, else
# %USERPROFILE%\carview-tools\signing, else this folder. Keep a backup: without it you cannot update an installed CarView.
$keyDir = if ($env:CARVIEW_KEYSTORE_DIR) { $env:CARVIEW_KEYSTORE_DIR }
          elseif (Test-Path (Join-Path $tools 'signing\carview.keystore')) { Join-Path $tools 'signing' }
          else { $proj }
$ks = Join-Path $keyDir 'carview.keystore'
$pwFile = Join-Path $keyDir 'keystore.password'
if (-not (Test-Path $ks)) {
    $pw = -join ((48..57) + (65..90) + (97..122) | Get-Random -Count 24 | ForEach-Object { [char]$_ })
    Set-Content -Path $pwFile -Value $pw -NoNewline -Encoding ascii
    Run "$jdk\bin\keytool.exe" @('-genkeypair', '-keystore', $ks, '-alias', 'carview', '-keyalg', 'RSA', '-keysize', '2048',
        '-validity', '10000', '-storepass', $pw, '-keypass', $pw, '-dname', 'CN=CarView')
}
$pw = Get-Content $pwFile -Raw
Run "$bt\apksigner.bat" @('sign', '--ks', $ks, '--ks-key-alias', 'carview', '--ks-pass', "pass:$pw", '--key-pass', "pass:$pw",
    '--out', "$proj\CarView.apk", "$out\aligned.apk")

Write-Host '6/6 verify'
Run "$bt\apksigner.bat" @('verify', "$proj\CarView.apk")
'{0:N1} MB  {1}' -f ((Get-Item "$proj\CarView.apk").Length / 1MB), "$proj\CarView.apk"
