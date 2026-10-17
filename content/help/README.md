# Help topics

In-app Help topics as Markdown, one file per topic. The file name (lower-case-with-hyphens) is the topic id, used in `help:<id>` links and the `#/help/<id>` route. `src/help/content.ts` bundles every `.md` here except this README.

Each file starts with front matter:

```
---
title: Quick start
order: 1
summary: One line shown under the title in the topic list.
---
```

Supported Markdown (see `src/help/markdown.ts`): `##` and `###` headings, paragraphs, `-` and `1.` lists, `>` tips, `**bold**`, `_italic_`, `` `keys` ``, links to other topics (`[text](help:topic-id)`) and to GOV.UK (`https://www.gov.uk/...`). Any other link shows as plain text.

Rules: describe only what exists, or mark it clearly as coming. Never state a tax rate, threshold, allowance or rule (`src/help/topics.test.ts` rejects money amounts and percentages); calculators show their figures from config.
