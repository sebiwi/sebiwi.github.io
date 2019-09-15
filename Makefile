.PHONY: serve build test

serve:
	@bundle exec jekyll serve --incremental

build:
	@bundle exec jekyll build --incremental

test:
	./test.sh
