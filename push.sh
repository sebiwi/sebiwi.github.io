#!/bin/bash

if [[ -z "$1" ]]; then
  echo "Please enter a git commit message"
  exit
fi

jekyll build && \
  pushd _site && \
  git add . && \
  git commit -am "$1" && \
  git push origin master && \
  popd && \
  echo "Successfully built and pushed to GitHub."
