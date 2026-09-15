cmake_minimum_required(VERSION 3.9)
cmake_policy(SET CMP0042 NEW)
set(CMAKE_VERBOSE_MAKEFILE ON)

set (CMAKE_CXX_STANDARD 20)

project (vscode-escript-native)

if(APPLE)
  set(PLATFORM darwin)
elseif(WIN32)
  set(PLATFORM win32)
elseif(ANDROID)
  set(PLATFORM android)
else()
  set(PLATFORM linux)
endif()

if(CMAKE_SYSTEM_PROCESSOR MATCHES "^(arm.*|ARM.*|aarch64)")
  set(ARCH arm64)
else()
  set(ARCH x64)
endif()

if(MSVC AND CMAKE_JS_NODELIB_DEF AND CMAKE_JS_NODELIB_TARGET)
  # Generate node.lib
  execute_process(COMMAND ${CMAKE_AR} /def:${CMAKE_JS_NODELIB_DEF} /out:${CMAKE_JS_NODELIB_TARGET} ${CMAKE_STATIC_LINKER_FLAGS})
endif()

execute_process(
  COMMAND node -p "require('node-addon-api').include"
  WORKING_DIRECTORY ${CMAKE_SOURCE_DIR}
  OUTPUT_VARIABLE NODE_ADDON_API_DIR
)
string(REGEX REPLACE "[\r\n\"]" "" NODE_ADDON_API_DIR ${NODE_ADDON_API_DIR})

add_compile_options("$<$<C_COMPILER_ID:MSVC>:/utf-8>")
add_compile_options("$<$<CXX_COMPILER_ID:MSVC>:/utf-8>")

file(GLOB_RECURSE SOURCE_FILES "cpp/*.cc" "cpp/*.h")
add_library(${PROJECT_NAME} SHARED ${SOURCE_FILES} ${CMAKE_JS_SRC})
set_target_properties(${PROJECT_NAME} PROPERTIES
  PREFIX "" SUFFIX ".node"
  OUTPUT_NAME "vscode-escript-native.${PLATFORM}-${ARCH}"
)

target_include_directories(${PROJECT_NAME} PRIVATE
  ${NODE_ADDON_API_DIR}
  ${CMAKE_JS_INC}
)
target_link_libraries(${PROJECT_NAME} PUBLIC
  ${CMAKE_JS_LIB}
)
target_compile_definitions(${PROJECT_NAME} PRIVATE
  NAPI_VERSION=8
  # Without this, node-addon-api's callback wrapper catches only Napi::Error.
  # Any other std::exception escaping an N-API method reaches std::terminate()
  # and aborts the language server with no message, stack, or log entry.
  NODE_ADDON_API_CPP_EXCEPTIONS_ALL
)

if(MSVC)
  target_compile_options(${PROJECT_NAME} PRIVATE
    $<$<CONFIG:>:/MT> #---------|
    $<$<CONFIG:Debug>:/MTd> #---|-- Statically link the runtime libraries
    $<$<CONFIG:Release>:/MT> #--|

    # Emit debug symbols for optimized builds as well. Without a PDB, a crash
    # dump from a released extension cannot be resolved to a function or line,
    # which is why native aborts have been unattributable.
    $<$<CONFIG:Release>:/Zi>
  )
  target_link_options(${PROJECT_NAME} PRIVATE
    # /DEBUG produces the PDB but disables these two by default; re-enabling
    # them keeps the shipped binary equivalent to a plain Release build.
    $<$<CONFIG:Release>:/DEBUG>
    $<$<CONFIG:Release>:/OPT:REF>
    $<$<CONFIG:Release>:/OPT:ICF>
  )
endif()

# since external prjs are always build, disable pol related ones
# eg Curl
add_subdirectory("${CMAKE_CURRENT_SOURCE_DIR}/polserver" EXCLUDE_FROM_ALL)

target_link_libraries(${PROJECT_NAME} PRIVATE
  bscript
  plib
  libtinyxml
)
