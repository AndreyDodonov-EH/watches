#pragma once
#include <stdint.h>
#include <stdbool.h>

struct ImuSample {
  float ax, ay, az;   // g
  float gx, gy, gz;   // deg/s
  float temp;         // °C
};

bool imu_init(void);                // QMI8658 on I2C SDA=40 SCL=39
bool imu_read(ImuSample &s);        // returns false if no new data ready
