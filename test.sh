#!/usr/bin/env bash
set -e # halt script on error

echo 'Testing...'
bundle exec jekyll build
bundle exec htmlproofer ./_site --only-4xx
