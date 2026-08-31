---
title:  "The Powershell diaries: part 2"
date:   2026-08-31 07:19:02 +0200
tags:
- comics
author: sebiwi
image: /images/comics/2026-08-31-the-powershell-diaries-part-2.png
# landscape strip: render wider than the column on desktop
wide: true
alt: "I had to do it again. How come you keep finding yourself in these situations? Server management just finds me. What was it this time? I just needed to know what was running on port 17002. Something like \"lsof -i :17002\"? Get-NetTCPConnection -State Listen -LocalPort 17002 | Select-Object LocalAddress, LocalPort, @{N='Process';E={(Get-Process -Id $_.OwningProcess).ProcessName}}. Can't you just use brainfuck instead?"
---
