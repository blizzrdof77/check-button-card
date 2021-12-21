console.info(`%cCHECK-BUTTON-CARD\n%cVersion: 1.3.0`, 'color: green; font-weight: bold;', '');

export interface config {
  due: boolean;
  text: any;
  button_style: any;
  card_style: any;
  entity: string;
  height: any;
  remove: boolean;
  saturation: any;
  title_position: string;
  title: string;
  topic: any;
  width: string;
  severity: any;
}

class CheckButtonCard extends HTMLElement {
  shadowRoot: any;
  _config: any;
  _hass: any;
  _counter: number = 0;
  _entityState: number = 0;
  _configSet: boolean = false;
  _undoTimestamp: number = 0;
  _currentTimestamp: number = 0;
  _clearUndo: any;
  _showInputTimeout: any;
  _overBy: boolean = false;
  _severity: any[] = [];

  constructor() {
    super();
    this.attachShadow({ mode: 'open' });
  }

  // Set config object.
  setConfig(config: config) {

    const root = this.shadowRoot;

    // Deep copy function.
    function deepcopy(value: any): any {
      if (!(!!value && typeof value == 'object')) {
        return value;
      }
      if (Object.prototype.toString.call(value) == '[object Date]') {
        return new Date(value.getTime());
      }
      if (Array.isArray(value)) {
        return value.map(deepcopy);
      }
      var result: any = {};
      Object.keys(value).forEach(
        function(key) { result[key] = deepcopy(value[key]); });
      return result;
    }

    // Avoid card config modifying lovelace config.
    config = deepcopy(config);

    // Default Config Settings
    if (root.lastChild) root.removeChild(root.lastChild);

    const defaultConfig = {
      height: '40px',
      discovery_prefix: 'homeassistant',
      undo_timeout: 15,
      color: 'var(--checkbutton-card-color, var(--primary-color))',
      text: {
        year: 'year',
        years: 'years',
        month: 'month',
        months: 'months',
        week: 'week',
        weeks: 'weeks',
        day: 'day',
        days: 'days',
        hour: 'hour',
        hours: 'hours',
        minute: 'minute',
        minutes: 'minutes',
        less_than: 'less than',
        more_than: 'more than',
        ago: 'ago',
        due_in: 'due in',
        over_by: 'over by'
      },
      display_limit: null,
      due: false,
      locale: 'en-us'
    };

    // Merge text objects
    config.text = Object.assign(defaultConfig.text, config.text);

    // Merge default and card config.
    config = Object.assign(defaultConfig, config);

    if (config.severity) {
      // Append seconds to severity array.
      let newArray = config.severity.slice();
      for (var i = 0; i < newArray.length; i++) {
        const value: number = this._convertToSeconds(newArray[i].value);
        newArray[i].seconds = value;
      }

      // Sort array by seconds.
      newArray.sort(function(a: any,b: any) {
          return a.seconds - b.seconds;
      });
      if (config.due == false) {
        newArray = newArray.reverse();
      }
      config.severity = newArray;
    }

    // Set bar width based on title position.
    if (config.title_position != 'inside') {
      if (!config.width) config.width = '70%';
    } else {
      if (!config.width) config.width = '100%';
    }

    // Create card elements
    const card = document.createElement('ha-card');
    const background = document.createElement('div');
    background.id = 'background';
    const button = document.createElement('cb-card-button');
    button.id = 'button';
    const buttonText = document.createElement('cb-card-buttontext');
    buttonText.id = 'buttonText';
    const undo = document.createElement('cb-card-undo');
    undo.id = 'undo';
    undo.style.setProperty('visibility', 'hidden');
    undo.textContent = 'undo';
    const buttonBlocker = document.createElement('cb-card-buttonblocker');
    buttonBlocker.id = 'buttonBlocker';
    buttonBlocker.style.setProperty('visibility', 'hidden');
    const title = document.createElement('cb-card-title');
    title.id = 'title';
    title.textContent = config.title;
    const titleBar = document.createElement('cb-card-titlebar');
    titleBar.id = 'titleBar';
    const inputBar = document.createElement('cb-card-inputbar');
    inputBar.id = 'inputBar';
    inputBar.style.setProperty('visibility', 'hidden');
    const minutesInput = document.createElement('input');
    minutesInput.type = 'number';
    minutesInput.id = 'minutesInput';
    minutesInput.placeholder = 'mm';
    const hoursInput = document.createElement('input');
    hoursInput.type = 'number';
    hoursInput.id = 'hoursInput';
    hoursInput.placeholder = 'hh';
    const daysInput = document.createElement('input');
    daysInput.type = 'number';
    daysInput.id = 'daysInput';
    daysInput.placeholder = 'dd';
    const inputForm = document.createElement('cb-card-inputform');
    inputForm.id = 'inputForm';
    const submitButton = document.createElement('cb-card-submitbutton');
    submitButton.id = 'submitButton';
    submitButton.textContent = '✔';
    const cancelButton = document.createElement('cb-card-cancelbutton');
    cancelButton.id = 'cancelButton';
    cancelButton.textContent = '✖';

    // Config Bar
    const configBar = document.createElement('cb-card-configbar');
    configBar.id = 'configBar';
    if (config.remove !== true) configBar.style.setProperty('visibility', 'hidden');
    const configInput = document.createElement('div');
    configInput.textContent = "Entity doesn't exist. Create?";
    configInput.id = 'configInput';
    const configForm = document.createElement('cb-card-configform');
    configForm.id = 'configForm';
    const submitConfigButton = document.createElement('cb-card-submitconfigbutton');
    submitConfigButton.id = 'submitConfigButton';
    submitConfigButton.textContent = '✔';

    // Style
    const style = document.createElement('style');
    style.textContent = `
      ha-card {
        background-color: var(--paper-card-background-color);
      }
      #background {
        position: relative;
        height: ${config.height};
      }
      #button {
        position: absolute;
        height: ${config.height};
        color: #FFF;
        text-align: center;
        font-weight: bold;
        font-size: 13px;
        text-shadow: 1px 1px #0007;
        border-radius: var(--ha-card-border-radius);
        width: ${config.width};
        --background-color: #000;
        right: 0;
        background-color: var(--background-color);
        cursor: pointer;
      }
      #buttonText {
        white-space: pre;
        display: table-cell;
        height: ${config.height};
        width: 1000px;
        vertical-align: middle;
      }
      #buttonBlocker {
        position: absolute;
        height: ${config.height};
        width: ${config.width};
        right: 0;
      }
      #undo {
        position: absolute;
        text-align: center;
        height: ${config.height};
        line-height: ${config.height};
        width: 80px;
        background-color: hsl(220, 40%, 50%);
        right: 0px;
        border-radius: var(--ha-card-border-radius);
        text-shadow: 1px 1px #0007;
        color: #FFF;
        font-size: 12px;
        font-weight: bold;
        cursor: pointer;
      }
      #undo:active {
        background-color: hsl(220, 50%, 40%);
      }
      #title {
        display: table-cell;
        height: ${config.height};
        width: 100%;
        padding-left: 10px;
        text-align: left;
        font-size: 14px;
        vertical-align: middle;
        color: var(--primary-text-color);
      }
      #titleBar {
        position: absolute;
        height: ${config.height};
        width: 100%;
        cursor: pointer;
      }
      #inputBar, #configBar{
        position: absolute;
        display: table-cell;
        box-sizing: border-box;
        vertical-align: middle;
        height: ${config.height};
        line-height: ${config.height};
        border-radius: var(--ha-card-border-radius);
        width: ${config.width};
        right: 0;
        --background-color: hsl(220, 50%, 50%);
        background-color: var(--background-color);
      }
      #secondsInput, #minutesInput, #hoursInput, #daysInput, #monthsInput, #yearsInput {
        height: 25px;
        width: 30px;
        text-align: center;
        margin-right: 4px;
        border-color: #000;
        border: 2px solid gray;
      }
      #configInput, #updateInput {
        right: 0px;
        text-shadow: 1px 1px #000;
        color: #FFF;
        font-weight: bold;
        text-align: center;
        width: 100%;
      }
      #submitButton, #submitConfigButton, #submitUpdateButton {
        text-align: center;
        cursor: pointer;
        position: relative;
        float: left;
        width: 50px;
        color: #00FF00;
        font-size: 22px;
        font-weight: bold;
      }
      #submitButton:hover, #submitConfigButton:hover, #submitUpdateButton:hover {
        font-size: 30px;
      }
      #submitConfigButton, #submitUpdateButton {
        float: right;
      }
      #cancelButton {
        text-align: center;
        cursor: pointer;
        position: relative;
        float: right;
        width: 50px;
        color: #FF0000;
        font-size: 22px;
        font-weight: bold;
      }
      #cancelButton:hover {
        font-size: 30px;
      }
      #inputForm {
        position: absolute;
        left: 50%;
        margin-left: -57px;
      }
      #configForm, #updateForm{
        position: absolute;
        width: 100%;
      }
      input[type=number]::-webkit-inner-spin-button, input[type=number]::-webkit-outer-spin-button {
        -webkit-appearance: none;
        margin: 0;
      }
    `;

    // Build card.
    titleBar.appendChild(title);

    // Create Button
    button.appendChild(buttonText);

    // Create Input Bar
    inputForm.appendChild(daysInput);
    inputForm.appendChild(hoursInput);
    inputForm.appendChild(minutesInput);
    inputBar.appendChild(cancelButton);
    inputBar.appendChild(inputForm);
    inputBar.appendChild(submitButton);

    // Create Config Bar
    configForm.appendChild(configInput);
    configBar.appendChild(configForm);
    configBar.appendChild(submitConfigButton);

    // Inside check
    if (config.title_position != 'inside') background.appendChild(titleBar);

    // Create Background
    background.appendChild(button);
    background.appendChild(inputBar);
    background.appendChild(configBar);
    background.appendChild(buttonBlocker);
    background.appendChild(undo);
    background.appendChild(style);

    card.appendChild(background);

    // Events
    button.addEventListener('mousedown', event => {
      this._buttonHold('down');
    });
    button.addEventListener('touchstart', event => {
      this._buttonHold('down');
    });
    button.addEventListener('mouseup', event => {
      this._buttonHold('up');
      this._action();
    });
    button.addEventListener('touchend', event => {
      this._buttonHold('up');
    });
    buttonBlocker.addEventListener('mouseup', event => {
      this._buttonHold('up');
    });
    buttonBlocker.addEventListener('touchend', event => {
      this._buttonHold('up');
    });
    undo.addEventListener('mouseup', event => {
      this._undo();
    });
    submitButton.addEventListener('mouseup', event => {
      this._setInput();
    });
    cancelButton.addEventListener('mouseup', event => {
      this._hideInput();
    });
    submitConfigButton.addEventListener('mouseup', event => {
      this._setConfig();
    });
    titleBar.addEventListener('click', event => {
      this._showAttributes('hass-more-info', { entityId: config.entity }, null);
    });
    // Add to root
    root.appendChild(card);

    this._config = config;
  }

  // Set hass object.
  set hass(hass: any) {
    const config = this._config;
    this._hass = hass;
    let entityState;
    if (hass.states[config.entity] == undefined || config.remove == true) {
      this._showConfigBar();
    }
    if (hass.states[config.entity] != undefined) {
      // Check if sensor has correct device_class attribute
      const device_class = hass.states[config.entity].attributes.device_class != undefined ? hass.states[config.entity].attributes.device_class == 'timestamp' ? true : false : false;
      if (!device_class) {
        this._showConfigBar();
      }
      entityState = hass.states[config.entity].state;
    }

    var counter = this._startTimer();
    clearInterval(this._counter);
    this._counter = counter;
    this._entityState = entityState;
  }

  // Starts update timer at 10 second intervals.
  _startTimer() {
    this._updateCard();
    var counter = setInterval(() => this._updateCard(), 10000);
    return counter;
  }

  // Updates card content.
  _updateCard() {
    const root = this.shadowRoot;
    const config = this._config;
    const hass = this._hass;
    let entityState;

    if (hass.states[config.entity] == undefined) entityState = 'undefined';
    else entityState = hass.states[config.entity].state;

    const convertTime = this._convertToText(entityState);
    let displayTime: number | string | null = convertTime.displayTime;
    if (displayTime == null) {
      displayTime = config.text.less_than + ' 1';
    }
    let displayText = convertTime.displayText;
    let moreThanText = "";
    if (displayText == ("year" || "years")){
      moreThanText = "more than "
    }
    let color;

    if (config.severity) color = this._computeSeverity(convertTime.seconds, config.severity);
    else color = config.color;

    let textContent;
    if (config.due == true) {
      if (this._overBy == false) textContent = `${config.text.due_in} ${moreThanText}${displayTime} ${displayText}`;
      else textContent = `${config.text.over_by} ${moreThanText}${displayTime} ${displayText}`;
    } else {
      textContent = `${moreThanText}${displayTime} ${displayText} ${this._config.text.ago}`;
    }
    if (config.title_position == 'inside') root.getElementById('buttonText').textContent = `${config.title} \r\n${textContent}`;
    else root.getElementById('buttonText').textContent = `${textContent}`;

    root.getElementById('button').style.setProperty('--background-color', color);
  }

  // Returns color based on severity array
  _computeSeverity(stateValue: number, sections: any[]) {
    const config = this._config;
    if (this._overBy == true) stateValue = stateValue * -1;
    let color: null | string = null;

    // For each object in array check if seconds is higher or lower than the current time.
    sections.forEach(section => {
      if (config.due == false ){
        if (stateValue >= section.seconds && color == null) {
          color = section.color;
        }
      } else {
        if (stateValue <= section.seconds && color == null) {
          color = section.color;
        }
      }
    });
    if (color == null) color = config.color;
    return color;
  }

  // Converts time string into seconds.
  _convertToSeconds(time: string) {
    let output;
    const timeFix = time + '';
    let timeArray: any[] = timeFix.split(' ');
    if (timeArray.length <= 1) {
      output = time;
    } else {
      switch (timeArray[1]) {
        case 'year':
        case 'years':
          output = timeArray[0] * 31556952;
          break;
        case 'month':
        case 'months':
          output = timeArray[0] * 2629746;
          break;
        case 'week':
        case 'weeks':
          output = timeArray[0] * 604800;
          break;
        case 'day':
        case 'days':
          output = timeArray[0] * 86400;
          break;
        case 'hour':
        case 'hours':
          output = timeArray[0] * 3600;
          break;
        case 'minute':
        case 'minutes':
          output = timeArray[0] * 60;
          break;
      }
    }
    output = Number(output);
    return output;
  }

  // Converts timestamp into text string.
  _convertToText(entityState: number | string) {
    // Try to convert from old timestamp format if present
    if (entityState === "unknown") {
      const timestampAttribute = this._hass.states[this._config.entity].attributes.timestamp;

      if(!isNaN(timestampAttribute)) {
          entityState = new Date(timestampAttribute * 1000).toISOString();
      }
    }
    const timestamp = Date.parse(entityState.toString()) / 1000;
    const config = this._config;

    const timeout = this._convertToSeconds(config.timeout);
    const dueTime = Number(timestamp) + timeout;
    const remainingTime = dueTime - Math.trunc(Date.now() / 1000);

    const elapsedTime = Date.now() / 1000 - Number(timestamp);

    let displayTime: null | number = null;
    let displayText;
    let seconds;
    if (config.due == true) {
      seconds = remainingTime;
    } else {
      seconds = elapsedTime;
    }
    let isSign = Math.sign(seconds);
    if (isSign == -1) {
      seconds = Math.abs(seconds);
      this._overBy = true;
    } else {
      this._overBy = false;
    }
    let minutes = seconds / 60;
    let hours = minutes / 60;
    let days = hours / 24;
    let weeks = seconds / 604800;
    let months = seconds / 2629746;
    let years = seconds / 31556952;

    const displayLimit = config.display_limit;

    if (minutes < 1 || displayLimit == 'minutes') {
      displayText = config.text.minute;
    } else if (hours < 1 || displayLimit == 'minutes') {
      if (config.due == true) displayTime = Math.round(minutes);
      else displayTime = Math.trunc(minutes);
      if (displayTime == 1) displayText = config.text.minute;
      else displayText = config.text.minutes;
    } else if (days < 1 || displayLimit == 'hours') {
      if (config.due == true) displayTime = Math.round(hours);
      else displayTime = Math.trunc(hours);
      if (displayTime == 1) displayText = config.text.hour;
      else displayText = config.text.hours;
    } else if (weeks < 1 || displayLimit == 'days') {
      if (config.due == true) displayTime = Math.round(days);
      else displayTime = Math.trunc(days);
      if (displayTime == 1) displayText = config.text.day;
      else displayText = config.text.days;
    } else if (months < 1 || displayLimit == 'weeks') {
      if (config.due == true) displayTime = Math.round(weeks);
      else displayTime = Math.trunc(weeks);
      if (displayTime == 1) displayText = config.text.week;
      else displayText = config.text.weeks;
    } else if (months < 19 || displayLimit == 'months') {
      if (config.due == true) displayTime = Math.round(months);
      else displayTime = Math.trunc(months);
      if (displayTime == 1) displayText = config.text.month;
      else displayText = config.text.months;
    } else if (years >= 1.5 || displayLimit == 'years') {
      if (config.due == true) displayTime = Math.trunc(years);
      else displayTime = Math.trunc(years);
      if (displayTime == 1) displayText = config.text.year;
      else displayText = config.text.years;
    }

    return {
      displayTime: displayTime,
      displayText: displayText,
      seconds: seconds
    };
  }

  _buildPayload(timestamp: number) {
    const config = this._config;
    const timestampDate = new Date(timestamp * 1000);
    let payload: any = {};
    payload.timestamp = timestampDate.toISOString();
    payload.timestamp_unix = timestamp;
    payload.timestamp_friendly = new Date(timestamp*1000).toLocaleString(config.locale);
    payload.timeout = config.timeout;
    if (config.timeout) {
      payload.timeout_timestamp = this._convertToSeconds(config.timeout) + Number(timestamp);
      payload.timeout_seconds = this._convertToSeconds(config.timeout);
    }
    payload.severity = config.severity;
    if (config.unit_of_measurement) payload.unit_of_measurement = config.unit_of_measurement;
    if (config.automation) payload.automation = config.automation;
    payload = JSON.stringify(payload);
    return payload;
  }

  // Publishes a new timestamp if button is pressed.
  _action() {
    const root = this.shadowRoot;
    root.getElementById('undo').style.removeProperty('visibility');
    root.getElementById('buttonBlocker').style.removeProperty('visibility');
    this._undoTimestamp = Date.parse(this._entityState.toString()) / 1000;
    this._currentTimestamp = Math.trunc(Date.now() / 1000);
    this._clearUndo = this._showUndo();
    let payload: any = this._buildPayload(this._currentTimestamp);
    this._publish(payload);
  }

  // Shows undo button if button is pressed.
  _showUndo() {
    const root = this.shadowRoot;
    const config = this._config;

    function clearUndo() {
      root.getElementById('undo').style.setProperty('visibility', 'hidden');
      root.getElementById('buttonBlocker').style.setProperty('visibility', 'hidden');
    }

    var clearUndoReturn = setTimeout(clearUndo, config.undo_timeout * 1000);
    return clearUndoReturn;
  }

  // Publishes previous timestamp if undo button is pressed.
  _undo() {
    const root = this.shadowRoot;
    root.getElementById('undo').style.setProperty('visibility', 'hidden');
    root.getElementById('buttonBlocker').style.setProperty('visibility', 'hidden');

    let payload: any = this._buildPayload(this._undoTimestamp);

    this._publish(payload);
    clearTimeout(this._clearUndo);
  }

  // Publishes timestamp based on user input.
  _setInput() {
    const root = this.shadowRoot;
    const minutes = root.getElementById('minutesInput').value;
    const hours = root.getElementById('hoursInput').value;
    const days = root.getElementById('daysInput').value;
    const totalTime = (minutes * 60) + (hours * 3600) + (days * 86400);
    const timestamp = Math.trunc(Date.now() / 1000) - totalTime;
    root.getElementById('inputBar').style.setProperty('visibility', 'hidden');
    root.getElementById('minutesInput').value = '';
    root.getElementById('hoursInput').value = '';
    root.getElementById('daysInput').value = '';

    let payload: any = this._buildPayload(timestamp);
    this._publish(payload);
    root.getElementById('undo').style.removeProperty('visibility');
    root.getElementById('buttonBlocker').style.removeProperty('visibility');
    this._currentTimestamp = timestamp;
    this._undoTimestamp = Date.parse(this._entityState.toString()) / 1000;
    this._clearUndo = this._showUndo();
  }

  // Hides input bar if user input is submitted or canceled.
  _hideInput() {
    const root = this.shadowRoot;
    root.getElementById('inputBar').style.setProperty('visibility', 'hidden');
  }

  // Shows config bar if sensor doesn't exist.
  _showConfigBar() {
    const root = this.shadowRoot;
    const config = this._config;
    root.getElementById('configBar').style.removeProperty('visibility');
    if (config.remove == true) {
      if (this._hass.states[config.entity] != undefined) {
        root.getElementById('configInput').textContent = 'Remove Entity?';
      } else {
        root.getElementById('submitConfigButton').style.setProperty('visibility', 'hidden');
        root.getElementById('configInput').textContent = 'Entity removed. Set remove to false.';
      }
      root.getElementById('configBar').style.setProperty('--background-color', '#FF0000');
    }
    if (this._hass.states[config.entity] != undefined) {
      // Existing entity, validate using new and legacy timestamp attributes
      const device_class = this._hass.states[config.entity].attributes.device_class != undefined ? this._hass.states[config.entity].attributes.device_class == 'timestamp' ? true : false : false;
      const unit_of_measurement = this._hass.states[config.entity].attributes.unit_of_measurement != undefined ? this._hass.states[config.entity].attributes.unit_of_measurement == 'timestamp' ? true : false : false;  
      if (!device_class && unit_of_measurement) {
        // Allows update to use device_class for existing sensors
        root.getElementById('configInput').textContent = 'Update Sensor Config?';
    } else {
        // Not a valid check-button-card sensor
        root.getElementById('submitConfigButton').style.setProperty('visibility', 'hidden');
        root.getElementById('configInput').textContent = 'Already exists. Incorrect entity type.';
        root.getElementById('configBar').style.setProperty('--background-color', '#FF0000');
      }
    }
  }

  // Shows user input bar if button is held for 1 second.
  _buttonHold(state: string) {
    const root = this.shadowRoot;

    function showConfig() {
      root.getElementById('inputBar').style.removeProperty('visibility');
      root.getElementById('buttonBlocker').style.removeProperty('visibility');
    }

    if (state == 'down') {
      this._showInputTimeout = setTimeout(showConfig, 500);
    } else if (state == 'up') {
      root.getElementById('buttonBlocker').style.setProperty('visibility', 'hidden');
      clearTimeout(this._showInputTimeout);
    }
  }

  // Press action
  _showAttributes(type: string, detail: any, options: any) {
    const root: any = this.shadowRoot;
    options = options || {};
    detail = detail === null || detail === undefined ? {} : detail;
    const event: any = new Event(type, {
      bubbles: options.bubbles === undefined ? true : options.bubbles,
      cancelable: Boolean(options.cancelable),
      composed: options.composed === undefined ? true : options.composed
    });
    event.detail = detail;
    root.dispatchEvent(event);
    return event;
  }

  // MQTT service call.
  _publish(payload: string) {
    const config = this._config;
    const sensorNameArray = config.entity.split('.');
    const sensorName = sensorNameArray[1];
    this._hass.callService('mqtt', 'publish', { topic: config.discovery_prefix + '/sensor/' + sensorName + '/state', payload: payload, retain: true });
  }

  // Creates and publishes auto-discovery MQTT topic.
  _setConfig() {
    const root = this.shadowRoot;
    const config = this._config;
    const sensorNameArray = config.entity.split('.');
    const sensorIcon = config.icon || 'mdi:checkbox-marked';
    const sensorName = sensorNameArray[1];
    root.getElementById('configBar').style.setProperty('visibility', 'hidden');
    const discoveryConfig =
      '{"value_template": "{{ value_json.timestamp }}","json_attributes_topic":"' +
      config.discovery_prefix +
      '/sensor/' +
      sensorName +
      '/state","state_topic":"' +
      config.discovery_prefix +
      '/sensor/' +
      sensorName +
      '/state","name": "' +
      sensorName +
      '","unique_id": "' +
      sensorName +
      '_homeassistant","icon":"' +
      sensorIcon + '","device_class":"timestamp"}';
    if (config.remove == true) {
      this._hass.callService('mqtt', 'publish', {
        topic: config.discovery_prefix + '/sensor/' + sensorName + '/state',
        payload: '',
        retain: true
      });
      this._hass.callService('mqtt', 'publish', {
        topic: config.discovery_prefix + '/sensor/' + sensorName + '/state/config',
        payload: '',
        retain: true
      });
    } else {
      this._hass.callService('mqtt', 'publish', {
        topic: config.discovery_prefix + '/sensor/' + sensorName + '/state/config',
        payload: discoveryConfig,
        retain: true
      });
      this._configSet = true;
      this._action();
      this._undo();
    }
  }

  getCardSize() {
    return 1;
  }
}

customElements.define('check-button-card', CheckButtonCard);
