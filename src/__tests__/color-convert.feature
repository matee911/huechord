Feature: RGB and HSL conversion

  Dominant colors are extracted in RGB but positioned on the wheel by hue, so
  every color has to survive a trip through HSL and back without drifting.

  Scenario Outline: Convert a known RGB color to HSL
    Given the RGB color <r>, <g>, <b>
    When it is converted to HSL
    Then the result is hue <h>, saturation <s>, lightness <l>

    Examples:
      | r   | g   | b   | h   | s   | l    |
      | 255 | 0   | 0   | 0   | 100 | 50   |
      | 0   | 255 | 0   | 120 | 100 | 50   |
      | 0   | 0   | 255 | 240 | 100 | 50   |
      | 255 | 255 | 0   | 60  | 100 | 50   |
      | 0   | 255 | 255 | 180 | 100 | 50   |
      | 255 | 0   | 255 | 300 | 100 | 50   |

  Scenario Outline: Achromatic colors get a defined hue
    Given the RGB color <r>, <g>, <b>
    When it is converted to HSL
    Then the hue is exactly 0
    And the saturation is exactly 0
    And the lightness is <l>

    Examples:
      | r   | g   | b   | l    |
      | 0   | 0   | 0   | 0    |
      | 255 | 255 | 255 | 100  |
      | 128 | 128 | 128 | 50.2 |
      | 64  | 64  | 64  | 25.1 |

  Scenario Outline: Round-trip conversion preserves the color
    Given the RGB color <r>, <g>, <b>
    When it is converted to HSL and back to RGB
    Then the result matches the original within rounding tolerance

    Examples:
      | r   | g   | b   |
      | 249 | 132 | 7   |
      | 150 | 200 | 40  |
      | 40  | 190 | 160 |
      | 37  | 150 | 190 |
      | 130 | 40  | 200 |
      | 200 | 30  | 60  |
      | 12  | 12  | 13  |
      | 255 | 255 | 255 |
      | 0   | 0   | 0   |

  Scenario Outline: Hue outside the wheel is wrapped back onto it
    Given the HSL color <h>, 100, 50
    When it is converted to RGB
    Then the result equals the conversion of hue <equivalent>

    Examples:
      | h    | equivalent |
      | -30  | 330        |
      | -120 | 240        |
      | 360  | 0          |
      | 420  | 60         |
      | 750  | 30         |

  Scenario: Hue stays inside the wheel
    Given every RGB combination of the channel values 0, 51, 128, 204 and 255
    When each one is converted to HSL
    Then every hue is at least 0 and below 360
    And every saturation and lightness is between 0 and 100
