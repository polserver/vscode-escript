cmake_minimum_required(VERSION 3.9)
cmake_policy(SET CMP0042 NEW)
set (CMAKE_CXX_STANDARD 11)

include(ExternalProject)

project (vscode-escript-native)
include_directories(${CMAKE_JS_INC})
set(CMAKE_VERBOSE_MAKEFILE ON)

file(GLOB SOURCE_FILES "cpp/*.cc" "cpp/*.h")
add_library(${PROJECT_NAME} SHARED ${SOURCE_FILES} ${CMAKE_JS_SRC})
set_target_properties(${PROJECT_NAME} PROPERTIES PREFIX "" SUFFIX ".node")
target_link_libraries(${PROJECT_NAME} ${CMAKE_JS_LIB})

execute_process(
  COMMAND node -p "require('node-addon-api').include"
  WORKING_DIRECTORY ${CMAKE_SOURCE_DIR}
  OUTPUT_VARIABLE NODE_ADDON_API_DIR
)
string(REGEX REPLACE "[\r\n\"]" "" NODE_ADDON_API_DIR ${NODE_ADDON_API_DIR})

target_include_directories(${PROJECT_NAME} PRIVATE ${NODE_ADDON_API_DIR})

target_compile_features(${PROJECT_NAME} PUBLIC cxx_std_17)

set(BLIB_SOURCE_DIR "${CMAKE_CURRENT_SOURCE_DIR}/polserver")
set(BLIB_BUILD_DIR "${BLIB_SOURCE_DIR}/bin-build")
set(BLIB_BIN_DIR "${BLIB_SOURCE_DIR}/bin")

if (WIN32)
  if ("${CMAKE_GENERATOR}" MATCHES "Ninja" AND "${CMAKE_CXX_COMPILER_ID}" MATCHES "Clang")
    set(ANTLR_LIB "antlr4-runtime.lib")
  else()
    set(ANTLR_LIB "antlr4-runtime-static.lib")
  endif()
  set(BLIB_LIBS
    "${BLIB_SOURCE_DIR}/bin/bscript.lib"
    "${BLIB_SOURCE_DIR}/bin/clib.lib"
    "${BLIB_SOURCE_DIR}/bin/format.lib"
    "${BLIB_SOURCE_DIR}/lib/antlr/install/lib/${ANTLR_LIB}"
  )
else()
  set(BLIB_LIBS
    "${BLIB_SOURCE_DIR}/bin/libbscript.a"
    "${BLIB_SOURCE_DIR}/bin/libclib.a"
    "${BLIB_SOURCE_DIR}/bin/libformat.a"
    "${BLIB_SOURCE_DIR}/lib/antlr/install/lib/libantlr4-runtime.a"
  )
endif()


ExternalProject_Add(libbscript
  SOURCE_DIR  ${BLIB_SOURCE_DIR}
  PREFIX blinb
  CMAKE_ARGS -DCMAKE_BUILD_TYPE=Release -DCMAKE_CXX_COMPILER=${CMAKE_CXX_COMPILER} -DCMAKE_C_COMPILER=${CMAKE_C_COMPILER} -DONLY_ECOMPILE=On

  BINARY_DIR ${BLIB_BUILD_DIR}

  BUILD_COMMAND ${CMAKE_COMMAND} --build . --config Release
  INSTALL_COMMAND ""

  BUILD_BYPRODUCTS ${BLIB_LIBS}
  LOG_DOWNLOAD 1
  LOG_CONFIGURE 1
  LOG_BUILD 1
  LOG_INSTALL 1
  LOG_OUTPUT_ON_FAILURE 1
  LOG_MERGED_STDOUTERR 1
)

add_dependencies(${PROJECT_NAME} libbscript)

if (UNIX)
  target_compile_options(${PROJECT_NAME} PRIVATE
    -fPIC
  )
endif()

target_include_directories(${PROJECT_NAME} PRIVATE
  "${BLIB_SOURCE_DIR}/pol-core"
  "${BLIB_SOURCE_DIR}/lib"
  "${BLIB_SOURCE_DIR}/bin-build"
  "${BLIB_SOURCE_DIR}/lib/antlr/install/include/antlr4-runtime"
)

target_link_libraries(${PROJECT_NAME} ${BLIB_LIBS})

add_definitions(-DNAPI_VERSION=5)
