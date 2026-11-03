# ----------------------------
# Makefile Options
# ----------------------------

NAME = KEYPAD
DESCRIPTION = "UIL Number Crunchers USB keypad"
COMPRESSED = NO

CFLAGS = -Wall -Wextra -Oz
CXXFLAGS = -Wall -Wextra -Oz

# ----------------------------

include $(shell cedev-config --makefile)

# Build and copy the program to where the website's installer serves it from.
site: all
	cp bin/$(NAME).8xp ../../packages/keypad/assets/ti84ce/
