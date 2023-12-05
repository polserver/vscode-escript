cmake_minimum_required(VERSION 3.9)
cmake_policy(SET CMP0042 NEW)
set (CMAKE_CXX_STANDARD 11)

if(APPLE AND DEFINED ENV{BUILD_OSX_UNIVERSAL_BINARY})
  message("-- Building universal macOS binary")
  set(CMAKE_OSX_ARCHITECTURES "arm64;x86_64" CACHE STRING "" FORCE)
  set(BUILD_OSX_UNIVERSAL_BINARY TRUE)
  set(PIPED_OSX_ARCHITECTURES "arm64|x86_64") # For ExternalProject
endif()

include(ExternalProject)

project (vscode-escript-native)
include_directories(${CMAKE_JS_INC})
set(CMAKE_VERBOSE_MAKEFILE ON)

file(GLOB_RECURSE SOURCE_FILES "cpp/*.cc" "cpp/*.h")
add_library(${PROJECT_NAME} SHARED ${SOURCE_FILES} ${CMAKE_JS_SRC})
set_target_properties(${PROJECT_NAME} PROPERTIES PREFIX "" SUFFIX ".node")

if(APPLE)
  set(PLATFORM darwin)
elseif(WIN32)
  set(PLATFORM win32)
else()
  set(PLATFORM linux)
endif()

if(BUILD_OSX_UNIVERSAL_BINARY)
  set(ARCH universal)
elseif(CMAKE_SYSTEM_PROCESSOR MATCHES "^(arm.*|ARM.*)")
  set(ARCH arm64)
else()
  set(ARCH x64)
endif()

set_target_properties(${PROJECT_NAME} PROPERTIES OUTPUT_NAME "vscode-escript-native.${PLATFORM}-${ARCH}")

target_link_libraries(${PROJECT_NAME} ${CMAKE_JS_LIB})

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

target_include_directories(${PROJECT_NAME} PRIVATE ${NODE_ADDON_API_DIR})
target_compile_definitions(${PROJECT_NAME} PUBLIC ANTLR4CPP_STATIC)
target_compile_features(${PROJECT_NAME} PUBLIC cxx_std_17)

set(BSCRIPT_SOURCE_DIR "${CMAKE_CURRENT_SOURCE_DIR}/polserver")
set(BSCRIPT_BUILD_DIR "${BSCRIPT_SOURCE_DIR}/bin-build")
set(BSCRIPT_BIN_DIR "${BSCRIPT_SOURCE_DIR}/bin")

if (WIN32)

  if ("${CMAKE_GENERATOR}" MATCHES "Ninja" AND "${CMAKE_CXX_COMPILER_ID}" MATCHES "Clang")
    set(ANTLR_LIB "antlr4-runtime.lib")
  else()
    set(ANTLR_LIB "antlr4-runtime-static.lib")
  endif()

  set(BSCRIPT_LIB "${BSCRIPT_SOURCE_DIR}/bin/${CMAKE_BUILD_TYPE}/bscript.lib")

  set(BSCRIPT_LIBS
    "${BSCRIPT_LIB}"
    "${BSCRIPT_SOURCE_DIR}/bin/${CMAKE_BUILD_TYPE}/plib.lib"
    "${BSCRIPT_SOURCE_DIR}/bin/${CMAKE_BUILD_TYPE}/clib.lib"
    "${BSCRIPT_SOURCE_DIR}/bin/${CMAKE_BUILD_TYPE}/format.lib"
    "${BSCRIPT_SOURCE_DIR}/bin/${CMAKE_BUILD_TYPE}/escriptgrammarlib.lib"
    "${BSCRIPT_SOURCE_DIR}/bin/${CMAKE_BUILD_TYPE}/stackwalk.lib"
    "${BSCRIPT_SOURCE_DIR}/lib/antlr/install/lib/${ANTLR_LIB}"
  )

  target_link_libraries(${PROJECT_NAME}
    "ws2_32"
  )

else()

  set(BSCRIPT_LIB "${BSCRIPT_SOURCE_DIR}/bin/libbscript.a")

  set(BSCRIPT_LIBS
    "${BSCRIPT_LIB}"
    "${BSCRIPT_SOURCE_DIR}/bin/libplib.a"
    "${BSCRIPT_SOURCE_DIR}/bin/libclib.a"
    "${BSCRIPT_SOURCE_DIR}/bin/libformat.a"
    "${BSCRIPT_SOURCE_DIR}/bin/libescriptgrammarlib.a"
    "${BSCRIPT_SOURCE_DIR}/lib/antlr/install/lib/libantlr4-runtime.a"
  )
endif()

if (UNIX)
  add_compile_options(-fPIC)
endif()
if (MSVC)
  set(CMAKE_CXX_FLAGS_RELEASE "/MT")
  set(CMAKE_CXX_FLAGS_DEBUG "/MTd")
endif()

set(SHOULD_BUILD_BSCRIPT FALSE)
foreach(POLSERVER_LIB BSCRIPT_LIBS)
  if (NOT EXISTS "${POLSERVER_LIB}")
    set(SHOULD_BUILD_BSCRIPT TRUE)
    break()
  endif()
endforeach()

if (SHOULD_BUILD_BSCRIPT)
  message("- will build libbscript")
  ExternalProject_Add(libbscript
    SOURCE_DIR  ${BSCRIPT_SOURCE_DIR}
    PREFIX blinb
    LIST_SEPARATOR |
    CMAKE_ARGS -DCMAKE_BUILD_TYPE=${CMAKE_BUILD_TYPE} -DCMAKE_CXX_COMPILER=${CMAKE_CXX_COMPILER} -DCMAKE_C_COMPILER=${CMAKE_C_COMPILER} -DONLY_ECOMPILE=On -DCMAKE_OSX_ARCHITECTURES=${PIPED_OSX_ARCHITECTURES}

    BINARY_DIR ${BSCRIPT_BUILD_DIR}

    BUILD_COMMAND ${CMAKE_COMMAND} --build . --config ${CMAKE_BUILD_TYPE}
    INSTALL_COMMAND ""

    BUILD_BYPRODUCTS ${BSCRIPT_LIBS}
    LOG_DOWNLOAD 1
    LOG_CONFIGURE 1
    LOG_BUILD 1
    LOG_INSTALL 1
    LOG_OUTPUT_ON_FAILURE 1
    LOG_MERGED_STDOUTERR 1
  )
  add_dependencies(${PROJECT_NAME} libbscript)
else()
  message("- will not build libbscript")
endif()

target_include_directories(${PROJECT_NAME} PRIVATE
  "${BSCRIPT_SOURCE_DIR}/pol-core"
  "${BSCRIPT_SOURCE_DIR}/pol-core/bscript"
  "${BSCRIPT_SOURCE_DIR}/lib"
  "${BSCRIPT_SOURCE_DIR}/bin-build"
  "${BSCRIPT_SOURCE_DIR}/lib/antlr/install/include/antlr4-runtime"
)

target_link_libraries(${PROJECT_NAME} ${BSCRIPT_LIBS})

if(MSVC)
    add_compile_options(
        $<$<CONFIG:>:/MT> #---------|
        $<$<CONFIG:Debug>:/MTd> #---|-- Statically link the runtime libraries
        $<$<CONFIG:Release>:/MT> #--|
    )
endif()

add_definitions(-DNAPI_VERSION=5)
