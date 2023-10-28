"use strict";

export class XmlParser {
  #xmlDocument = new XmlDocument();

  #_xmlString;

  // takes XML string and returns JSON
  async parse(xmlString) {
    if (Object(xmlString).constructor === Promise) {
      this.#_xmlString = await xmlString;
    } else {
      this.#_xmlString = xmlString;
    }

    let stringIndex = 0;

    stringIndex = this.#read_prolog(stringIndex);

    stringIndex = this.#read_until_element(stringIndex);

    // +1 is to skip the "<" bracket
    let [lastStringIndex, element] = this.#create_element(
      stringIndex + 1,
      null
    );

    this.#xmlDocument.root = element;

    return this.#to_JSON(this.#xmlDocument);
  }

  // convert XML data structure to JSON
  #to_JSON(xmlDocument) {
    let data = {};
    data.xml = xmlDocument.attributes;
    data.root = this.#parse_elements_to_json(xmlDocument.root);
    return data;
  }

  // convet XML Element to JSON
  #parse_elements_to_json(element) {
    let data = {};
    data.name = element.name;
    data.text = element.text;
    data.attributes = element.attributes;
    data.children = [];

    for (const child of element.children) {
      data.children.push(this.#parse_elements_to_json(child));
    }

    // if these keys don't have values, then remove them

    if (Object.keys(data.attributes).length === 0) {
      delete data.attributes;
    }

    if (data.children.length == 0) {
      delete data.children;
    }

    if (data.text == "") {
      delete data.text;
    }

    return data;
  }

  // read until "<" is found meaning beginning of an Element
  #read_until_element(stringIndex) {
    while (true) {
      let character = this.#_xmlString[stringIndex];

      if (character == "<") {
        return stringIndex;
      }

      stringIndex++;
    }
  }

  // creates XML Element and its children Elements
  #create_element(stringIndex, parent) {
    let [newStringIndex, name] = this.#get_element_name(stringIndex);
    let result = this.#read_attributes(newStringIndex);

    let xmlElement = new XmlElement();
    xmlElement.name = name;
    xmlElement.attributes = result.attributes;
    xmlElement.parent = parent;

    stringIndex = result.stringIndex;

    if (result.selfClosing == true) {
      return [stringIndex, xmlElement];
    }

    while (true) {
      let character = this.#_xmlString[stringIndex];

      // if this is not a control character
      if (this.#is_control_character(character) == false) {
        if (character == "<") {
          if (this.#_xmlString[stringIndex + 1] == "/") {
            let [newStringIndex, closingTagName] = this.#read_past_closing_tag(
              stringIndex + 2
            );

            if (xmlElement.name != closingTagName) {
              console.error(
                `Closing tag "${closingTagName}" didn't match opening tag "${xmlElement.name}" at position ${newStringIndex}`
              );
            }

            return [newStringIndex + 1, xmlElement];
          }

          let [newIndex, child] = this.#create_element(
            stringIndex + 1,
            xmlElement
          );

          // if returned child is current element, that means it was a closing tag
          if (child != xmlElement) {
            xmlElement.children.push(child);
          }

          stringIndex = newIndex;
          continue;
        }

        // if reached this part, then Element content must me text
        let [newIndex, text] = this.#read_element_text(
          stringIndex,
          xmlElement.name
        );

        xmlElement.text = text;

        return [newIndex, xmlElement];
      }

      stringIndex++;
    }
  }

  // read until we're past closing tags
  #read_past_closing_tag(stringIndex) {
    return this.#get_element_name(stringIndex);
  }

  // read text from Element content
  #read_element_text(stringIndex, endTagName) {
    let text = "";

    while (true) {
      let character = this.#_xmlString[stringIndex];

      // reached beginning of closing tag
      if (character == "<" && this.#_xmlString[stringIndex + 1] == "/") {
        let offset = endTagName.length + 3;

        return [stringIndex + offset, text];
      }

      text += character;

      stringIndex++;
    }
  }

  // fully read Element opening tag name
  #get_element_name(stringIndex) {
    let name = "";

    while (true) {
      let character = this.#_xmlString[stringIndex];

      if (this.#is_control_character(character) || character == ">") {
        return [stringIndex, name];
      }

      name += character;

      stringIndex++;
    }
  }

  // returns true or false if received control character
  #is_control_character(character) {
    // returns an integer between 0 and 65535 representing the UTF-16 code unit at the given index
    let unicode_number = character.charCodeAt(0);

    // https://en.wikipedia.org/wiki/ASCII#ASCII_control_code_chart
    // control characters are between 0 and 32
    if (unicode_number < 33) {
      return true;
    }

    return false;
  }

  // if line starts with <? is called prolog, so read it
  #read_prolog(stringIndex) {
    if (
      this.#_xmlString[stringIndex] == "<" &&
      this.#_xmlString[stringIndex + 1] == "?"
    ) {
      // skip <?xml part
      stringIndex += 5;

      let result = this.#read_attributes(stringIndex);
      this.#xmlDocument.attributes = result.attributes;

      return result.stringIndex;
    }

    return stringIndex;
  }

  // read all attributes from an element as key value pairs
  #read_attributes(stringIndex) {
    let attributes = {};
    let current_attribute_key = "";
    let current_attribute_value = "";

    // attribute value is using single or double quotes
    let attribute_value_quote_type = "";

    let is_reading_key = true;

    while (true) {
      let character = this.#_xmlString[stringIndex];

      if (this.#is_control_character(character) == true) {
        stringIndex++;
        continue;
      }

      if (character == "?" && this.#_xmlString[stringIndex + 1] == ">") {
        // encluntered prolog closing ?> symbols, were done

        return { stringIndex: stringIndex + 1, attributes: attributes };
      } else if (character == ">" && is_reading_key == true) {
        // was looking for key, but encountered closing bracket, were done

        let obj = { stringIndex: stringIndex + 1, attributes: attributes };
        if (this.#_xmlString[stringIndex - 1] == "/") {
          obj.selfClosing = true;
        }

        return obj;
      } else if (
        is_reading_key == false &&
        character == attribute_value_quote_type
      ) {
        // reading value and encountered closing quote, so finishing reading value
        attributes[current_attribute_key] = current_attribute_value;
        current_attribute_key = "";
        current_attribute_value = "";
        attribute_value_quote_type = "";
        is_reading_key = true;
        stringIndex++;

        continue;
      } else if (
        character == "=" &&
        (this.#_xmlString[stringIndex + 1] == "'" ||
          this.#_xmlString[stringIndex + 1] == '"')
      ) {
        // encountered = and opening quote, so done reading key and switch to reading value
        attribute_value_quote_type = this.#_xmlString[stringIndex + 1];
        stringIndex += 2;
        is_reading_key = false;

        continue;
      }

      if (is_reading_key == true) {
        // skip space when reading attribute key
        if (character != " ") {
          current_attribute_key += character;
        }
      } else {
        current_attribute_value += character;
      }

      stringIndex++;
    }
  }
}

class XmlDocument {
  attributes = {};
  root = null;
}

class XmlElement {
  name = "";
  text = "";
  attributes = {};
  parent = null;
  children = [];
}
