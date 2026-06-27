# -*- mode: python ; coding: utf-8 -*-
import sys
import os
import site
block_cipher = None

# Build name from environment variable (default: WebGenAI)
BUILD_NAME = os.environ.get('BUILD_NAME', 'WebGenAI')

# Windows 빌드 시 mlx 관련 모듈 제외
excludes = []
if sys.platform == "win32":
    excludes = ["mlx_lm", "mlx"]

datas = [
    ('templates', 'templates'),
    ('static', 'static'),
    ('app', 'app'),
]

binaries = []

# Collect llama_cpp and nvidia DLLs
site_packages = site.getsitepackages()[0]

# Collect llama_cpp DLLs
llama_cpp_lib = os.path.join(site_packages, 'llama_cpp', 'lib')
if os.path.exists(llama_cpp_lib):
    for f in os.listdir(llama_cpp_lib):
        if f.endswith('.dll'):
            binaries.append((os.path.join(llama_cpp_lib, f), 'llama_cpp/lib'))

# Collect CUDA 12.4 DLLs from system installation into the same dir
for cuda_ver in ['v12.4', 'v12.5']:
    cuda_bin = f'C:\\Program Files\\NVIDIA GPU Computing Toolkit\\CUDA\\{cuda_ver}\\bin'
    if os.path.exists(cuda_bin):
        for f in os.listdir(cuda_bin):
            if f.endswith('.dll') and ('cuda' in f.lower() or 'cublas' in f.lower() or 'cufft' in f.lower() or 'curand' in f.lower() or 'cusolver' in f.lower() or 'cusparse' in f.lower() or 'nvrtc' in f.lower() or 'nvjitlink' in f.lower()):
                binaries.append((os.path.join(cuda_bin, f), 'llama_cpp/lib'))
        break

a = Analysis(
    ['run_desktop.py'],
    pathex=[],
    binaries=binaries,
    datas=datas,
    hiddenimports=[
        'flask',
        'markdown',
        'jinja2',
        'werkzeug',
        'click',
        'markupsafe',
        'webview',
        'pywebview',
        'llama_cpp',
        'llama_cpp.llama_cpp',
        'llama_cpp.server',
        'huggingface_hub',
        'app',
        'app.config',
        'app.model',
        'app.thinking',
        'app.chat',
        'app.modular',
        'app.download',
        'app.strategies',
        'app.vulkan',
        'app.prompts',
        'app.utils',
        'app.backends',
        'app.backends.base',
        'app.backends.local',
        'app.backends.gemini',
        'app.routes',
        'app.routes.main',
        'app.routes.model_routes',
        'app.routes.project_routes',
        'app.routes.design_routes',
    ],
    hookspath=['./hooks'],
    hooksconfig={},
    runtime_hooks=[],
    excludes=excludes,
    win_no_prefer_redirects=False,
    win_private_assemblies=False,
    cipher=block_cipher,
    noarchive=False,
)

pyz = PYZ(a.pure, a.zipped_data, cipher=block_cipher)

exe = EXE(
    pyz,
    a.scripts,
    a.binaries,
    a.zipfiles,
    a.datas,
    [],
    name=BUILD_NAME,
    debug=False,
    bootloader_ignore_signals=False,
    strip=False,
    upx=True,
    upx_exclude=['*.dll'],
    runtime_tmpdir=None,
    console=True,
    disable_windowed_traceback=False,
    argv_emulation=False,
    target_arch=None,
    codesign_identity=None,
    entitlements_file=None,
)
