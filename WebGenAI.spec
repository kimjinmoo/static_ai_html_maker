# -*- mode: python ; coding: utf-8 -*-
import sys
block_cipher = None

# Windows 빌드 시 mlx 관련 모듈 제외
excludes = []
if sys.platform == "win32":
    excludes = ["mlx_lm", "mlx", "numpy._core.multiarray"]

datas = [
    ('templates', 'templates'),
    ('static', 'static'),
]

a = Analysis(
    ['app.py'],
    pathex=[],
    binaries=[],
    datas=datas,
    hiddenimports=[
        'flask',
        'llama_cpp',
        'llama_cpp.llama_cpp',
        'llama_cpp.llama_chat_format',
        'llama_cpp.llama_grammar',
        'llama_cpp.llama_tokenizer',
        'llama_cpp.llama_lora',
        'huggingface_hub',
        'huggingface_hub.hf_file_system',
        'markdown',
        'jinja2',
        'werkzeug',
        'click',
        'markupsafe',
    ],
    hookspath=[],
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
    name='WebGenAI',
    debug=False,
    bootloader_ignore_signals=False,
    strip=False,
    upx=True,
    upx_exclude=[],
    runtime_tmpdir=None,
    console=True,
    disable_windowed_traceback=False,
    argv_emulation=False,
    target_arch=None,
    codesign_identity=None,
    entitlements_file=None,
)
