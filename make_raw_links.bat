$owner="kanakkujur"
$repo="ece-gate-mock"
$branch="main"
$out="github_raw_urls.txt"

git ls-files | ForEach-Object {
  "https://raw.githubusercontent.com/$owner/$repo/$branch/$($_ -replace '\\','/')"
} | Set-Content -Encoding utf8 $out

"Done: $out"
