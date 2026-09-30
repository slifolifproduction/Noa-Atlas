/*! @license Constellation figures derived from d3-celestial.
 * Copyright (c) 2015, Olaf Frohn
 * All rights reserved.
 *
 * Redistribution and use in source and binary forms, with or without
 * modification, are permitted provided that the following conditions are met:
 *
 * 1. Redistributions of source code must retain the above copyright notice,
 * this list of conditions and the following disclaimer.
 *
 * 2. Redistributions in binary form must reproduce the above copyright notice,
 * this list of conditions and the following disclaimer in the documentation
 * and/or other materials provided with the distribution.
 *
 * 3. Neither the name of the copyright holder nor the names of its
 * contributors may be used to endorse or promote products derived from this
 * software without specific prior written permission.
 *
 * THIS SOFTWARE IS PROVIDED BY THE COPYRIGHT HOLDERS AND CONTRIBUTORS "AS IS"
 * AND ANY EXPRESS OR IMPLIED WARRANTIES, INCLUDING, BUT NOT LIMITED TO, THE
 * IMPLIED WARRANTIES OF MERCHANTABILITY AND FITNESS FOR A PARTICULAR PURPOSE
 * ARE DISCLAIMED. IN NO EVENT SHALL THE COPYRIGHT HOLDER OR CONTRIBUTORS BE
 * LIABLE FOR ANY DIRECT, INDIRECT, INCIDENTAL, SPECIAL, EXEMPLARY, OR
 * CONSEQUENTIAL DAMAGES (INCLUDING, BUT NOT LIMITED TO, PROCUREMENT OF
 * SUBSTITUTE GOODS OR SERVICES; LOSS OF USE, DATA, OR PROFITS; OR BUSINESS
 * INTERRUPTION) HOWEVER CAUSED AND ON ANY THEORY OF LIABILITY, WHETHER IN
 * CONTRACT, STRICT LIABILITY, OR TORT (INCLUDING NEGLIGENCE OR OTHERWISE)
 * ARISING IN ANY WAY OUT OF THE USE OF THIS SOFTWARE, EVEN IF ADVISED OF THE
 * POSSIBILITY OF SUCH DAMAGE.
 */

/**
 * The twelve constellations of the zodiac as figures: each star's place,
 * projected onto a plane (north up, east to the left, as on a sky chart) and
 * scaled so the figure fits in [-1, 1], its brightness (visual magnitude:
 * smaller is brighter), and the lines that draw the figure, as runs of star
 * indices.
 *
 * Derived from d3-celestial (constellations.lines.json, stars.6.json),
 * Copyright (c) 2015, Olaf Frohn, BSD-3-Clause licence:
 * https://github.com/ofrohn/d3-celestial
 *
 * Only the shape is used, to arrange the map. Nothing here reads anything
 * into a person.
 */

export const ZODIAC = ['aries', 'taurus', 'gemini', 'cancer', 'leo', 'virgo', 'libra', 'scorpio', 'sagittarius', 'capricorn', 'aquarius', 'pisces'] as const;
export type ZodiacKey = (typeof ZODIAC)[number];

export interface Figure {
  stars: [number, number][];
  mags: number[];
  lines: number[][];
}

export const FIGURES: Record<ZodiacKey, Figure> = {
  aries: {
    stars: [
      [-1.0, -0.51],
      [0.107, -0.085],
      [0.43, 0.213],
      [0.459, 0.382],
    ],
    mags: [3.61, 2.01, 2.64, 3.88],
    lines: [[0, 1, 2, 3]],
  },
  taurus: {
    stars: [
      [-1.0, -0.358],
      [-0.212, -0.114],
      [-0.12, -0.08],
      [-0.007, -0.068],
      [-0.047, -0.169],
      [-0.119, -0.255],
      [-0.855, -0.751],
      [0.237, 0.098],
      [0.665, 0.243],
      [0.206, 0.44],
      [0.695, 0.28],
      [0.541, 0.734],
    ],
    mags: [2.97, 0.87, 3.4, 3.65, 3.77, 3.53, 1.65, 3.41, 3.73, 3.91, 3.61, 4.29],
    lines: [
      [0, 1, 2, 3, 4, 5, 6],
      [3, 7, 8, 9],
      [8, 10, 11],
    ],
  },
  gemini: {
    stars: [
      [1.0, 0.042],
      [0.831, 0.041],
      [0.394, -0.196],
      [-0.173, -0.659],
      [-0.662, -0.808],
      [-0.885, -0.458],
      [-0.689, -0.356],
      [-0.36, 0.089],
      [-0.026, 0.217],
      [0.524, 0.595],
      [0.366, 0.912],
      [-0.318, 0.582],
    ],
    mags: [3.31, 2.87, 3.06, 4.41, 1.58, 1.16, 4.06, 3.5, 4.01, 1.93, 3.35, 3.58],
    lines: [
      [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10],
      [7, 11],
    ],
  },
  cancer: {
    stars: [
      [-0.362, 0.554],
      [-0.06, -0.025],
      [-0.029, -0.329],
      [-0.103, -1.0],
      [0.556, 0.8],
    ],
    mags: [4.26, 3.94, 4.66, 4.03, 3.53],
    lines: [
      [0, 1, 2, 3],
      [1, 4],
    ],
  },
  leo: {
    stars: [
      [0.305, 0.394],
      [0.318, 0.131],
      [0.155, -0.038],
      [-0.547, -0.076],
      [-1.0, 0.251],
      [-0.549, 0.204],
      [0.197, -0.234],
      [0.507, -0.377],
      [0.597, -0.254],
    ],
    mags: [1.36, 3.48, 2.01, 2.56, 2.14, 3.33, 3.43, 3.88, 2.97],
    lines: [
      [0, 1, 2, 3, 4, 5, 0],
      [2, 6, 7, 8],
    ],
  },
  virgo: {
    stars: [
      [1.0, -0.306],
      [0.947, -0.095],
      [0.624, 0.013],
      [0.383, 0.047],
      [0.071, 0.228],
      [-0.098, 0.476],
      [-0.66, 0.248],
      [-0.958, 0.233],
      [0.157, -0.501],
      [0.229, -0.167],
      [-0.203, 0.009],
      [-0.501, -0.085],
      [-0.994, -0.101],
    ],
    mags: [4.04, 3.59, 3.89, 2.74, 4.38, 0.98, 4.07, 3.87, 2.85, 3.39, 3.38, 4.23, 3.73],
    lines: [
      [0, 1, 2, 3, 4, 5, 6, 7],
      [8, 9, 3],
      [4, 10, 11, 12],
    ],
  },
  libra: {
    stars: [
      [0.345, 0.421],
      [0.621, -0.405],
      [0.074, -1.0],
      [-0.314, -0.517],
      [-0.345, 0.676],
      [-0.379, 0.823],
    ],
    mags: [3.25, 2.75, 2.61, 3.91, 3.6, 3.66],
    lines: [
      [0, 1, 2, 3, 4, 5],
      [1, 3],
    ],
  },
  scorpio: {
    stars: [
      [0.816, -0.532],
      [0.793, -0.791],
      [0.714, -1.0],
      [0.47, -0.571],
      [0.342, -0.508],
      [0.242, -0.376],
      [0.02, 0.075],
      [-0.006, 0.353],
      [-0.048, 0.673],
      [-0.321, 0.739],
      [-0.711, 0.721],
      [-0.87, 0.508],
      [-0.791, 0.426],
      [-0.653, 0.283],
    ],
    mags: [2.89, 2.29, 2.56, 2.9, 1.06, 2.82, 2.29, 3, 3.62, 3.32, 1.86, 2.99, 2.39, 1.62],
    lines: [
      [0, 1, 2],
      [1, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13],
    ],
  },
  sagittarius: {
    stars: [
      [0.613, 0.542],
      [0.527, 0.401],
      [0.568, 0.13],
      [0.476, -0.133],
      [0.664, -0.392],
      [-0.244, 1.0],
      [-0.26, 0.771],
      [0.02, 0.133],
      [0.243, -0.039],
      [-0.674, 0.846],
      [-0.732, 0.454],
      [-0.681, -0.08],
      [-0.429, -0.165],
      [-0.278, -0.187],
      [-0.15, -0.142],
      [0.117, -0.081],
      [0.768, 0.165],
      [-0.037, 0.001],
      [-0.007, -0.352],
      [-0.074, -0.394],
      [-0.178, -0.517],
      [-0.231, -0.583],
      [-0.232, -0.696],
      [0.084, -0.389],
      [0.131, -0.292],
    ],
    mags: [3.1, 1.79, 2.72, 2.82, 3.84, 3.96, 3.96, 2.6, 3.17, 4.12, 4.37, 4.7, 4.59, 5.02, 4.86, 2.05, 2.98, 3.32, 3.76, 2.88, 4.88, 3.92, 4.52, 3.52, 4.86],
    lines: [
      [0, 1, 2, 3, 4],
      [5, 6, 7, 8, 3],
      [9, 10, 11, 12, 13, 14, 15, 8, 2, 16, 1, 7, 17, 15, 18, 19, 20, 21, 22],
      [18, 23, 24, 15],
    ],
  },
  capricorn: {
    stars: [
      [0.931, -0.561],
      [0.858, -0.353],
      [0.689, -0.077],
      [0.316, 0.603],
      [0.193, 0.753],
      [-0.56, 0.342],
      [-1.0, -0.231],
      [-0.85, -0.182],
      [-0.465, -0.166],
      [-0.112, -0.13],
    ],
    mags: [4.3, 3.05, 4.77, 4.13, 4.12, 3.77, 2.85, 3.69, 4.28, 4.08],
    lines: [[0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 0]],
  },
  aquarius: {
    stars: [
      [1.0, 0.057],
      [0.948, 0.036],
      [0.544, -0.108],
      [0.189, -0.328],
      [0.024, -0.283],
      [-0.051, -0.341],
      [-0.118, -0.336],
      [-0.298, -0.023],
      [-0.56, 0.044],
      [-0.472, 0.547],
      [0.182, 0.241],
      [0.074, -0.015],
      [-0.014, -0.399],
      [-0.613, 0.502],
      [-0.808, 0.406],
    ],
    mags: [3.78, 4.73, 2.9, 2.95, 3.86, 3.65, 4.04, 3.73, 4.41, 3.68, 4.29, 4.17, 4.8, 3.96, 4.82],
    lines: [
      [0, 1, 2, 3, 4, 5, 6, 7, 8, 9],
      [2, 10],
      [3, 11],
      [5, 12],
      [13, 8, 14],
    ],
  },
  pisces: {
    stars: [
      [-0.368, -0.65],
      [-0.346, -0.885],
      [-0.429, -0.765],
      [-0.344, -0.499],
      [-0.555, -0.256],
      [-0.702, 0.009],
      [-0.877, 0.282],
      [-0.788, 0.264],
      [-0.66, 0.166],
      [-0.541, 0.137],
      [-0.368, 0.076],
      [-0.254, 0.063],
      [-0.104, 0.076],
      [0.416, 0.107],
      [0.62, 0.16],
      [0.746, 0.127],
      [0.826, 0.17],
      [0.86, 0.26],
      [0.757, 0.346],
      [0.598, 0.324],
      [0.552, 0.251],
      [1.0, 0.237],
    ],
    mags: [4.67, 4.51, 4.74, 4.66, 3.62, 4.26, 3.82, 4.61, 4.45, 4.84, 5.21, 4.27, 4.44, 4.03, 4.13, 4.27, 5.05, 3.7, 4.95, 4.49, 4.95, 4.48],
    lines: [
      [0, 1, 2, 0, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 14],
      [17, 21],
    ],
  },
};
