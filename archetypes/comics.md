---
title: "{{ replace .File.ContentBaseName "-" " " | title }}"
date: {{ .Date }}
tags:
- comics
author: sebiwi
image: /images/comics/{{ .File.ContentBaseName }}.png
# Transcript: doubles as alt text, meta description, and search text.
alt: ""
---
