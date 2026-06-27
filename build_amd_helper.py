import subprocess
import sys
import os

vulkan_sdk = sys.argv[1] if len(sys.argv) > 1 else os.environ.get('VULKAN_SDK', '')

if not vulkan_sdk:
    print("[ERROR] Vulkan SDK path not provided")
    sys.exit(1)

print(f"[INFO] Using Vulkan SDK: {vulkan_sdk}")

cmake_dir = os.path.join(vulkan_sdk, 'Lib', 'cmake', 'Vulkan')
os.makedirs(cmake_dir, exist_ok=True)

vulkan_config = os.path.join(cmake_dir, 'VulkanConfig.cmake')
with open(vulkan_config, 'w') as f:
    f.write(f'''set(VULKAN_INCLUDE_DIR "{os.path.join(vulkan_sdk, 'Include').replace(chr(92), chr(92)+chr(92))}")
set(VULKAN_LIBRARY "{os.path.join(vulkan_sdk, 'Lib', 'vulkan-1.lib').replace(chr(92), chr(92)+chr(92))}")
if(NOT TARGET Vulkan::Vulkan)
  add_library(Vulkan::Vulkan UNKNOWN IMPORTED)
  set_target_properties(Vulkan::Vulkan PROPERTIES
    IMPORTED_LOCATION "${{VULKAN_LIBRARY}}"
    INTERFACE_INCLUDE_DIRECTORIES "${{VULKAN_INCLUDE_DIR}}"
  )
endif()
''')

print(f"[INFO] Created VulkanConfig.cmake at {vulkan_config}")

env = os.environ.copy()
env['VULKAN_SDK'] = vulkan_sdk
env['CMAKE_PREFIX_PATH'] = vulkan_sdk
env['CMAKE_ARGS'] = '-DGGML_VULKAN=on'
env['PATH'] = os.path.join(vulkan_sdk, 'Bin') + ';' + env.get('PATH', '')

print("[INFO] Installing build dependencies...")
deps = ['scikit-build-core[pyproject]', 'cmake', 'ninja', 'numpy']
if sys.platform != 'win32':
    deps.append('patchelf')
result = subprocess.run(
    [sys.executable, '-m', 'pip', 'install'] + deps,
    env=env
)
if result.returncode != 0:
    sys.exit(result.returncode)

print("[INFO] Installing llama-cpp-python with Vulkan support...")
result = subprocess.run(
    [sys.executable, '-m', 'pip', 'install', 'llama-cpp-python', '--no-cache-dir', '--no-binary', 'llama-cpp-python', '--no-build-isolation'],
    env=env
)
sys.exit(result.returncode)
