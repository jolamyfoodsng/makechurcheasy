cmake_minimum_required(VERSION 3.20)

project(mce-obs-bridge LANGUAGES C)

set(OBS_SOURCE_DIR "" CACHE PATH "Path to an OBS Studio source checkout")
set(MCE_SIMDE_INCLUDE_DIR "" CACHE PATH "Path containing simde/simde-common.h")
set(MCE_LIBOBS_API_MAJOR 31 CACHE STRING "Minimum libobs API major version")
set(MCE_LIBOBS_API_MINOR 0 CACHE STRING "Minimum libobs API minor version")
set(MCE_LIBOBS_API_PATCH 0 CACHE STRING "Minimum libobs API patch version")

if(NOT OBS_SOURCE_DIR OR NOT EXISTS "${OBS_SOURCE_DIR}/libobs/obs.h")
  message(FATAL_ERROR "OBS_SOURCE_DIR must point to an OBS Studio source checkout")
endif()

configure_file(
  "${CMAKE_CURRENT_SOURCE_DIR}/obsconfig.h.in"
  "${CMAKE_CURRENT_BINARY_DIR}/generated/obsconfig.h"
  @ONLY
)

add_library(mce-obs-bridge MODULE mce-obs-bridge.c)

target_compile_features(mce-obs-bridge PRIVATE c_std_11)
target_include_directories(
  mce-obs-bridge
  PRIVATE
    "${CMAKE_CURRENT_BINARY_DIR}/generated"
    "${OBS_SOURCE_DIR}/libobs"
    "${OBS_SOURCE_DIR}/frontend/api"
    "${OBS_SOURCE_DIR}/UI/obs-frontend-api"
    "${MCE_SIMDE_INCLUDE_DIR}"
)

target_compile_definitions(
  mce-obs-bridge
  PRIVATE
    MCE_LIBOBS_API_MAJOR=${MCE_LIBOBS_API_MAJOR}
    MCE_LIBOBS_API_MINOR=${MCE_LIBOBS_API_MINOR}
    MCE_LIBOBS_API_PATCH=${MCE_LIBOBS_API_PATCH}
)

set_target_properties(
  mce-obs-bridge
  PROPERTIES
    PREFIX ""
    OUTPUT_NAME "mce-obs-bridge"
)

if(WIN32)
  target_compile_definitions(mce-obs-bridge PRIVATE WIN32_LEAN_AND_MEAN NOMINMAX)
elseif(APPLE)
  set_target_properties(mce-obs-bridge PROPERTIES SUFFIX ".dylib")
  target_link_options(mce-obs-bridge PRIVATE "-Wl,-undefined,dynamic_lookup")
endif()
