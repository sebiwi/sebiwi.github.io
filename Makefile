.PHONY: serve build test

serve:
	@bundle exec jekyll serve --incremental

build:
	@bundle exec jekyll build

test:
	./test.sh
