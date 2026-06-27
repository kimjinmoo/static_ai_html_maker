import os


def auto_detect_vulkan_sdk():
    _vulkan_sdk = os.path.join("C:", "VulkanSDK")
    if os.path.isdir(_vulkan_sdk):
        try:
            _sdk_ver = sorted(os.listdir(_vulkan_sdk), reverse=True)[0]
            _vulkan_path = os.path.join(_vulkan_sdk, _sdk_ver)
            os.environ["VULKAN_SDK"] = _vulkan_path
            os.environ["CMAKE_PREFIX_PATH"] = os.path.join(_vulkan_path, "Lib", "cmake")
        except (IndexError, OSError):
            pass
