Feature: Dominant color extraction

  A downsampled document composite is reduced to the handful of colors a
  retoucher would name if asked what the image is made of, each weighted by how
  much of the visible image it covers.

  Scenario: Single-color image
    Given a buffer of 400 pixels where every pixel is 200, 30, 60
    When dominant colors are extracted
    Then exactly 1 dominant color is returned
    And the first color is approximately 200, 30, 60
    And its weight is approximately 1.0

  Scenario: Two-color split image
    Given a buffer of 400 pixels split evenly between 255, 0, 0 and 0, 0, 255
    When dominant colors are extracted
    Then exactly 2 dominant colors are returned
    And every weight is approximately 0.5

  Scenario: Weights describe how much of the image each color covers
    Given a buffer of 400 pixels that is three quarters 255, 0, 0 and one quarter 0, 0, 255
    When dominant colors are extracted
    Then the weights are approximately 0.75 and 0.25 in that order

  Scenario: Real-world-like image
    Given a buffer of 10000 pixels drawn from more than 100 distinct colors
    When dominant colors are extracted
    Then between 5 and 8 dominant colors are returned
    And they are sorted by descending weight
    And every color carries rgb, hsl and a weight
    And the weights sum to approximately 1.0

  Scenario: Fully transparent pixels are ignored
    Given a buffer of 400 pixels split evenly between opaque 0, 255, 0 and fully transparent 255, 0, 0
    When dominant colors are extracted
    Then exactly 1 dominant color is returned
    And the first color is approximately 0, 255, 0
    And its weight is approximately 1.0

  Scenario: A half-transparent layer over an opaque one
    Given a buffer of 400 opaque pixels that are 128, 0, 128, the blend a half-transparent 255, 0, 0 layer makes over an opaque 0, 0, 255 one
    When dominant colors are extracted
    Then exactly 1 dominant color is returned
    And the first color is approximately 128, 0, 128
    And its weight is approximately 1.0

  Scenario: A half-transparent layer over nothing
    Given a buffer of 400 pixels split evenly between opaque 0, 255, 0 and half-transparent 255, 0, 0
    When dominant colors are extracted
    Then exactly 2 dominant colors are returned
    And every weight is approximately 0.5

  Scenario: Nothing left to quantize
    Given a buffer of 400 pixels that are all fully transparent
    When dominant colors are extracted
    Then an empty palette is returned

  Scenario: Extraction stays inside the frame budget
    Given a buffer of 10000 pixels drawn from more than 100 distinct colors
    When dominant colors are extracted
    Then extraction completed in under 50 milliseconds
