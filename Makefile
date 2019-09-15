.PHONY: serve build test

serve:
	@bundle exec jekyll serve

build:
	@bundle exec jekyll serve

test:
	./test.sh
