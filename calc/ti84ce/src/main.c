/*
 *--------------------------------------
 * Program Name: KEYPAD
 * Description:  Turns a TI-84 Plus CE into a USB keypad for the
 *               UIL Number Crunchers practice site.
 *
 * The calculator enumerates as a USB CDC serial device. Every key
 * press / release is sent as one line of ASCII text:
 *
 *     HELLO TI84CE 1      sent on connect, and whenever the host writes anything
 *     D <key>             key went down
 *     U <key>             key went up
 *     BYE                 program is exiting
 *
 * Press [ON] to quit.
 *--------------------------------------
 */

#include <keypadc.h>
#include <srldrvce.h>
#include <stdbool.h>
#include <string.h>
#include <ti/screen.h>

#define HELLO_LINE "HELLO TI84CE 1\n"

/* Key names indexed by [group - 1][bit]; NULL means no key at that position.
 * Names must match the key ids used by the website (js/keys.js). */
static const char *const key_names[7][8] = {
    { "graph", "trace", "zoom", "window", "yequ", "2nd", "mode", "del" },
    { NULL, "sto", "ln", "log", "square", "recip", "math", "alpha" },
    { "0", "1", "4", "7", "comma", "sin", "apps", "xton" },
    { "dot", "2", "5", "8", "lparen", "cos", "prgm", "stat" },
    { "chs", "3", "6", "9", "rparen", "tan", "vars", NULL },
    { "enter", "add", "sub", "mul", "div", "power", "clear", NULL },
    { "down", "left", "right", "up", NULL, NULL, NULL, NULL },
};

static srl_device_t srl;
static bool has_srl_device = false;
static bool status_dirty = true;
static uint8_t srl_buf[512];

static void send_str(const char *str) {
    if (has_srl_device) {
        srl_Write(&srl, str, strlen(str));
    }
}

static void send_key_event(char kind, const char *name) {
    char line[16];
    size_t len = strlen(name);

    line[0] = kind;
    line[1] = ' ';
    memcpy(&line[2], name, len);
    line[2 + len] = '\n';
    line[3 + len] = '\0';
    send_str(line);
}

static usb_error_t handle_usb_event(usb_event_t event, void *event_data,
                                    usb_callback_data_t *callback_data) {
    usb_error_t err;

    if ((err = srl_UsbEventCallback(event, event_data, callback_data)) != USB_SUCCESS) {
        return err;
    }

    if (event == USB_DEVICE_CONNECTED_EVENT && !(usb_GetRole() & USB_ROLE_DEVICE)) {
        usb_ResetDevice(event_data);
    }

    if (event == USB_HOST_CONFIGURE_EVENT ||
        (event == USB_DEVICE_ENABLED_EVENT && !(usb_GetRole() & USB_ROLE_DEVICE))) {
        usb_device_t device;

        if (has_srl_device) {
            return USB_SUCCESS;
        }

        if (event == USB_HOST_CONFIGURE_EVENT) {
            /* We're plugged into a computer: use the device representing the host. */
            device = usb_FindDevice(NULL, NULL, USB_SKIP_HUBS);
            if (device == NULL) {
                return USB_SUCCESS;
            }
        } else {
            device = event_data;
        }

        if (srl_Open(&srl, device, srl_buf, sizeof srl_buf, SRL_INTERFACE_ANY, 9600) == SRL_SUCCESS) {
            has_srl_device = true;
            status_dirty = true;
            send_str(HELLO_LINE);
        }
    }

    if (event == USB_DEVICE_DISCONNECTED_EVENT && has_srl_device && event_data == srl.dev) {
        srl_Close(&srl);
        has_srl_device = false;
        status_dirty = true;
    }

    return USB_SUCCESS;
}

static void draw_status(void) {
    os_ClrHome();
    os_SetCursorPos(0, 0);
    os_PutStrFull("UIL Number Crunchers");
    os_SetCursorPos(1, 0);
    os_PutStrFull("USB Keypad Mode");
    os_SetCursorPos(3, 0);
    os_PutStrFull(has_srl_device ? "Status: CONNECTED   " : "Status: waiting...  ");
    os_SetCursorPos(5, 0);
    os_PutStrFull("Plug into computer,");
    os_SetCursorPos(6, 0);
    os_PutStrFull("then click Connect");
    os_SetCursorPos(7, 0);
    os_PutStrFull("on the website.");
    os_SetCursorPos(9, 0);
    os_PutStrFull("Press [ON] to quit.");
    status_dirty = false;
}

int main(void) {
    uint8_t prev[7] = { 0 };
    usb_error_t usb_error;

    usb_error = usb_Init(handle_usb_event, NULL, srl_GetCDCStandardDescriptors(), USB_DEFAULT_INIT_FLAGS);
    if (usb_error != USB_SUCCESS) {
        usb_Cleanup();
        os_ClrHome();
        os_PutStrFull("USB init failed.");
        do kb_Scan(); while (!kb_AnyKey());
        return 1;
    }

    kb_EnableOnLatch();
    kb_ClearOnLatch();

    while (!kb_On) {
        uint8_t group;

        usb_HandleEvents();

        if (status_dirty) {
            draw_status();
        }

        if (has_srl_device) {
            char in_buf[32];
            int bytes_read = srl_Read(&srl, in_buf, sizeof in_buf);

            if (bytes_read < 0) {
                has_srl_device = false;
                status_dirty = true;
            } else if (bytes_read > 0) {
                /* Any data from the host is treated as "who are you?" */
                send_str(HELLO_LINE);
            }
        }

        kb_Scan();

        for (group = 0; group < 7; group++) {
            uint8_t now = (uint8_t)kb_Data[group + 1];
            uint8_t changed = now ^ prev[group];
            uint8_t bit;

            if (!changed) {
                continue;
            }

            for (bit = 0; bit < 8; bit++) {
                const char *name = key_names[group][bit];

                if ((changed & (1 << bit)) && name != NULL) {
                    send_key_event((now & (1 << bit)) ? 'D' : 'U', name);
                }
            }
            prev[group] = now;
        }
    }

    send_str("BYE\n");
    usb_HandleEvents();

    kb_ClearOnLatch();
    kb_DisableOnLatch();
    usb_Cleanup();
    os_ClrHome();
    return 0;
}
