---
name: academic-humanizer
license: MIT
source: junbolian/Academic-Humanizer; skymanbp/sci-paper de-ai
version: "1.0"
---

# Academic Humanizer (adapted)

Adapted from Academic-Humanizer (MIT) and the `de-ai` skill in skymanbp/sci-paper (MIT).
Use this as a writing filter, not a personality generator.

## Non-negotiable

- Never change a number, unit, citation, formula, negation, causal direction, comparison, or scope.
- Do not invent specificity or new evidence.
- Clean, precise academic prose is the goal; do not add jokes, first person, or dramatic voice.

## Remove AI tells

- Inflated significance: "paves the way", "crucial step", "opens new avenues", "sheds light".
- Empty intensifiers: "comprehensive", "extensive", "wide range", "numerous", "various".
- Formulaic openers: "In recent years", "With the rapid development of", "It is worth noting".
- Connective stacking: repeated "Moreover / Furthermore / Additionally".
- Rule-of-three padding; negative parallelism; false ranges ("from theory to practice").
- Overlong clause-stacked sentences; split into one claim per sentence.
- Unnecessary em dashes.
- Hedging soup: "somewhat", "relatively", "fairly", "to some extent" without a measured basis.
- Novelty padding and "to the best of our knowledge" unless the gap is specific.

## Chinese scientific register

- 不写“值得注意的是”“综上所述”“首先/其次/最后”“不仅……而且”“赋能”“范式”“深层”“旨在”等空泛连接。
- 一段只做一个判断；段首是主张，随后给证据和限定。
- 首次出现的英文术语必须给中文解释；`fleet` 写成“生产机群（fleet）”，`shot` 写成“样本/次运行”，不要留下未解释的行话。
- 未报告的数据写“原文未报告”或“未提供”，不要机械重复英文 `not reported`。
- 不把不同分母、不同故障模型、不同评价对象的数字并列成一个结论。
- 保留校准过的限定语（“可能”“在该设置下”“尚不能排除”）；不要为了显得果断而删掉它们。

## Paragraph contract

1. 段首一句可检验的主张。
2. 中段给出数值、单位、条件、对照或引用。
3. 末句说明边界、反证或与中心论点的关系。

删除任何没有前文的因果/评价框架；连接词不构成推理。

## False positives

保留正式术语、必要的被动语态、单个强调短句、方法名、公式和引文原话。
