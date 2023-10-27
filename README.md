# xml-parser

XML parser that takes XML string and outputs it in JSON format. It doesn't use any libraries or dependencies so you can use it in Node.js or browsers. I made this as an exercise, so it might not handle more advanced use cases.

## Basic Usage

```js
import { XmlParser } from '@enxas/xml-parser';

const xmlParser = new XmlParser();

let jsonData = await xmlParser.parse('<article category="technology">New Smartphone is Out.</article>');
```

## Things to improve

-   Error handling.

-   Parsing is done in infinite loops, so improper XML file will cause parsing to get stuck.

-   I don't like how parser keeps track of which character is being parsed, because it's prone to errors. In retrospective I would have made current character index a property instead of passing it manually to each method.